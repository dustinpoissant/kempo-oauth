import { access, readFile, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { listProviders } from '../server/providers/index.js';
import { fieldNames } from '../server/utils/config/settings.js';

/*
  Static checks that what the code asks for is what the extension declares.

  This is the shape of bug kempo-blog shipped: its config declared prefixed permission names while
  its routes checked unprefixed ones, so its "New Post" gate silently denied everyone. A check
  against a name nobody registered does not error — it answers no, forever.

  Here the same class of drift has two more ways to hurt:

  - A client secret written without its declared `secret` type is **stored in plain text**, in a
    row kempo's own settings screen shows to anyone who can open it.
  - A provider whose settings are not declared works in development (where `setSetting` upserts
    anything) and has nothing to configure on a real install.
*/

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(root, 'kempo-config.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const walk = async dir => {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for(const entry of entries){
    if(entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if(entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
};

const read = async directory => new Map(await Promise.all(
  (await walk(path.join(root, directory))).map(async file => [path.relative(root, file), await readFile(file, 'utf8')]),
));

const publicFiles = await read('public');
const serverFiles = await read('server');
const adminFiles = await read('admin');

const declared = new Map(config.settings.map(setting => [setting.name, setting]));

export default {
  'every permission a route checks is one the extension declares': async ({ pass, fail }) => {
    const known = new Set(config.permissions.map(permission => permission.name));
    const checked = new Set();

    for(const [file, text] of publicFiles){
      for(const match of text.matchAll(/gate\(request,\s*'([^']+)'\)/g)) checked.add(match[1]);
      if(/gate\(request,\s*(?!')\S/.test(text)) return fail(`${file} calls gate() with something other than a literal, which this check cannot see`);
    }

    if(!checked.size) return fail('found no gate() calls at all — the pattern this test looks for has changed');
    for(const name of checked) if(!known.has(name)) return fail(`a route checks "${name}", which kempo-config.json does not declare`);
    for(const name of known) if(!checked.has(name)) return fail(`"${name}" is declared but no route checks it`);

    pass(`${checked.size} permissions, declared and used`);
  },

  'every group is made of declared permissions': async ({ pass, fail }) => {
    const known = new Set(config.permissions.map(permission => permission.name));
    for(const group of config.groups) for(const name of group.permissions) if(!known.has(name)) return fail(`${group.name} grants "${name}", which is not declared`);
    pass(`${config.groups.length} groups`);
  },

  'every provider’s settings are declared, with the types that keep a secret secret': async ({ pass, fail }) => {
    for(const provider of listProviders()){
      for(const name of fieldNames(provider)){
        const setting = declared.get(name);
        if(!setting) return fail(`${provider.name}: "${name}" is not declared in kempo-config.json`);
        if(!setting.description) return fail(`"${name}" has no description`);

        const expected = name.endsWith('_enabled') ? 'boolean' : name.endsWith('_client_secret') ? 'secret' : 'string';
        if(setting.type !== expected) return fail(`"${name}" is declared as ${setting.type}, should be ${expected} — a secret that is not type "secret" is stored in plain text`);
      }

      if(declared.get(`${provider.name}_enabled`).value !== 'false') return fail(`${provider.name} must be off until somebody switches it on`);
      if(declared.get(`${provider.name}_client_secret`).value !== '') return fail(`${provider.name}: a client secret must not have a default`);
    }
    pass(`${listProviders().length} providers`);
  },

  'no declared setting belongs to nobody': async ({ pass, fail }) => {
    const owned = new Set([...listProviders().flatMap(fieldNames), 'base_url', 'after_login_path', 'link_verified_emails', 'privacy_operator', 'privacy_contact_email']);
    for(const name of declared.keys()) if(!owned.has(name)) return fail(`"${name}" is declared but no provider or global setting uses it`);
    pass(`${declared.size} settings, all in use`);
  },

  'every provider ships the icon it names': async ({ pass, fail }) => {
    for(const provider of listProviders()){
      try {
        await access(path.join(root, 'public', 'icons', provider.icon));
      } catch {
        return fail(`${provider.name} names public/icons/${provider.icon}, which does not exist`);
      }
    }
    pass('all present');
  },

  'every provider has the whole contract': async ({ pass, fail }) => {
    for(const provider of listProviders()){
      for(const key of ['name', 'label', 'icon', 'consoleUrl', 'scopeSeparator']) if(typeof provider[key] !== 'string' || !provider[key]) return fail(`${provider.name}: ${key} missing`);
      for(const key of ['pkce', 'mono']) if(typeof provider[key] !== 'boolean') return fail(`${provider.name}: ${key} must be a boolean`);
      if(!Array.isArray(provider.scopes) || !provider.scopes.length) return fail(`${provider.name}: scopes missing`);
      if(!['body', 'basic'].includes(provider.clientAuth)) return fail(`${provider.name}: clientAuth must be "body" or "basic"`);
      if(typeof provider.endpoints !== 'function' || typeof provider.profile !== 'function') return fail(`${provider.name}: endpoints and profile must be functions`);

      const { authorize, token } = provider.endpoints({ tenant: 'common' });
      for(const url of [authorize, token]) if(!url.startsWith('https://')) return fail(`${provider.name}: ${url} is not https`);
      if(!/^[a-z0-9]+$/.test(provider.name)) return fail(`${provider.name}: names are used in URLs and setting names, so lower-case letters and digits only`);
    }
    pass('contract met');
  },

  'nothing in server/utils touches an HTTP request or response': async ({ pass, fail }) => {
    // kempo's own rule for backend utilities, and what keeps them usable from a CLI, a webhook or another extension.
    for(const [file, text] of serverFiles){
      if(!file.startsWith(path.join('server', 'utils'))) continue;
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const hit = code.match(/\b(request|response|req|res)\.(headers|cookies|body|query|params|status|json|redirect|setHeader|cookie)\b/);
      if(hit) return fail(`${file} reaches for ${hit[0]}`);
    }
    pass('HTTP-agnostic');
  },

  'the slots the buttons fill are the ones kempo’s login and register pages offer': async ({ pass, fail }) => {
    const slots = { 'public/login-buttons.global.html': 'login-form-after', 'public/register-buttons.global.html': 'register-form-after' };
    for(const [file, slot] of Object.entries(slots)){
      const text = publicFiles.get(path.normalize(file));
      if(!text?.includes(`location="${slot}"`)) return fail(`${file} should fill location="${slot}"`);
    }
    pass('login-form-after and register-form-after');
  },

  'every custom element is prefixed k-oauth-': async ({ pass, fail }) => {
    const tags = [];
    for(const text of [...publicFiles.values(), ...adminFiles.values()]){
      for(const match of text.matchAll(/customElements\.define\('([^']+)'/g)) tags.push(match[1]);
    }
    if(!tags.length) return fail('found no custom elements');
    for(const tag of tags) if(!tag.startsWith('k-oauth-')) return fail(`${tag} does not follow the k-<extension>- naming`);
    pass(tags.join(', '));
  },

  'the flow cookie is scoped to this extension’s own routes': async ({ pass, fail }) => {
    const cookies = serverFiles.get(path.normalize('server/http/cookies.js'));
    const flowPath = cookies.match(/FLOW_PATH = '([^']+)'/)?.[1];
    const scope = config['public-scope'];

    if(flowPath !== `/${scope}/api`) return fail(`the cookie path is ${flowPath}, but the routes live under /${scope}/api`);
    if('kempo' in pkg) return fail('package.json has a kempo field; public-scope and the rest live in kempo-config.json only');
    pass(flowPath);
  },

  'install.js creates the unique index the sign-in path depends on': async ({ pass, fail }) => {
    const install = await readFile(path.join(root, 'install.js'), 'utf8');
    if(!/CREATE UNIQUE INDEX IF NOT EXISTS[^`]*"kempoOauthAccount"\s*\("provider",\s*"providerUserId"\)/.test(install)) return fail('no unique index on (provider, providerUserId) — kempo’s installer does not carry schema indexes across');
    pass('present');
  },

  'the package publishes everything the extension needs': async ({ pass, fail }) => {
    for(const entry of ['admin', 'public', 'server', 'install.js', 'update.js', 'uninstall.js', 'sdk.js', 'kempo-config.json']){
      if(!pkg.files.includes(entry)) return fail(`"${entry}" is missing from package.json "files", so it would not be published`);
    }
    pass('files list complete');
  },
};
