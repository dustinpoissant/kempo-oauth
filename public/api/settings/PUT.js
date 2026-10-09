import { setSetting } from 'kempo/server/sdk.js';
import { listProviders } from '../../../server/providers/index.js';
import { OWNER, fieldNames, readGlobal, settingName } from '../../../server/utils/config/settings.js';
import { DECLARED_SETTINGS, descriptionOf, typeOf } from '../../../server/utils/config/declared.js';
import describe from '../../../server/utils/config/describe.js';
import safePath from '../../../server/utils/flow/safePath.js';
import originOf from '../../../server/http/origin.js';
import { gate } from '../../../server/http/gate.js';

/*
  Saves the settings, one kempo setting per field.

  These are ordinary kempo settings and also appear under /admin/settings — nothing here is a
  second store. What this route adds is validation before the write, and its own permission:
  `oauth:settings` can be given to whoever connects the site to its sign-in providers without also
  giving them `system:settings:update`, which is every setting on the installation.

  **Blank means unchanged, not cleared.** A client secret is never sent to the browser, so the field
  showing it is always empty — saving the form after changing something else would otherwise wipe
  the secret and silently turn the provider off. Clearing one is possible, but it takes an explicit
  `null`, which no accidental submit produces.

  Body shape:

  ```json
  {
    "global": { "base_url": "https://example.com", "after_login_path": "/account", "link_verified_emails": true },
    "providers": { "google": { "enabled": true, "client_id": "…", "client_secret": "…" } }
  }
  ```
*/

const SECRET_FIELD = 'client_secret';

const TENANT_PATTERN = /^[A-Za-z0-9.-]{1,100}$/;

const badRequest = (response, message) => response.status(400).json({ error: message });

export default async (request, response) => {
  const [gateError] = await gate(request, 'oauth:settings');
  if(gateError) return response.status(gateError.code).json({ error: gateError.msg });

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const updates = {};

  /*
    Global settings
  */
  const incoming = body.global && typeof body.global === 'object' ? body.global : {};

  if(incoming.base_url !== undefined){
    const raw = String(incoming.base_url || '').trim();
    if(raw){
      let url;
      try {
        url = new URL(raw);
      } catch {
        return badRequest(response, 'The site address must be a full URL, such as https://example.com');
      }
      if(!['http:', 'https:'].includes(url.protocol) || url.search || url.hash){
        return badRequest(response, 'The site address must be a plain http or https URL, with no query or fragment');
      }
      updates.base_url = `${url.origin}${url.pathname}`.replace(/\/+$/, '');
    } else {
      updates.base_url = '';
    }
  }

  if(incoming.after_login_path !== undefined){
    const path = safePath(String(incoming.after_login_path || '').trim());
    if(!path) return badRequest(response, 'The page to land on after signing in must be a path on this site, such as /account');
    updates.after_login_path = path;
  }

  if(incoming.link_verified_emails !== undefined){
    if(typeof incoming.link_verified_emails !== 'boolean') return badRequest(response, 'link_verified_emails must be true or false');
    updates.link_verified_emails = incoming.link_verified_emails;
  }

  /*
    Provider settings
  */
  const incomingProviders = body.providers && typeof body.providers === 'object' ? body.providers : {};

  for(const provider of listProviders()){
    const entry = incomingProviders[provider.name];
    if(entry === undefined) continue;
    if(!entry || typeof entry !== 'object') return badRequest(response, `Settings for ${provider.label} must be an object`);

    if(entry.enabled !== undefined){
      if(typeof entry.enabled !== 'boolean') return badRequest(response, `${provider.label}: enabled must be true or false`);
      updates[settingName(provider, 'enabled')] = entry.enabled;
    }

    if(entry.client_id !== undefined){
      const clientId = String(entry.client_id ?? '').trim();
      if(clientId.length > 500) return badRequest(response, `${provider.label}: that client id is too long to be right`);
      // Unlike the secret, an id can be emptied by saving it empty — it is shown back, so it is never blank by accident.
      updates[settingName(provider, 'client_id')] = clientId;
    }

    const secret = entry[SECRET_FIELD];
    if(secret === null){
      updates[settingName(provider, SECRET_FIELD)] = '';
    } else if(secret !== undefined){
      const trimmed = String(secret).trim();
      if(trimmed.length > 2000) return badRequest(response, `${provider.label}: that client secret is too long to be right`);
      if(trimmed) updates[settingName(provider, SECRET_FIELD)] = trimmed;
    }

    for(const field of provider.extraFields){
      if(entry[field.name] === undefined) continue;
      const value = String(entry[field.name] ?? '').trim() || field.default;
      if(field.name === 'tenant' && !TENANT_PATTERN.test(value)) return badRequest(response, `${provider.label}: the tenant can only contain letters, numbers, dots and hyphens`);
      updates[settingName(provider, field.name)] = value;
    }
  }

  if(!Object.keys(updates).length) return badRequest(response, 'Nothing to save');

  const writesSecret = Object.keys(updates).some(name => name.endsWith(`_${SECRET_FIELD}`) && updates[name] !== '');
  if(writesSecret && !process.env.SETTINGS_ENCRYPTION_KEY){
    return response.status(500).json({
      error: 'SETTINGS_ENCRYPTION_KEY is not set on this server, so a client secret cannot be stored. Add it to the environment and restart.',
    });
  }

  const allowed = new Set([...listProviders().flatMap(fieldNames), 'base_url', 'after_login_path', 'link_verified_emails']);

  for(const [name, value] of Object.entries(updates)){
    // Belt and braces: nothing reaches setSetting that is not both a known field and declared.
    if(!allowed.has(name) || !DECLARED_SETTINGS.has(name)) continue;

    /*
      The type and description come from kempo-config.json rather than being restated here.
      setSetting stores exactly what it is handed, so passing null for the description would erase
      the text kempo's own /admin/settings screen shows next to each of these, and losing `secret`
      would store a client secret as plain text.

      isPublic stays false throughout, and setSetting forces it false for a secret regardless.
    */
    const [error] = await setSetting(OWNER, name, value, typeOf(name), false, descriptionOf(name));
    if(error) return response.status(error.code).json({ error: error.msg });
  }

  const { baseUrl } = await readGlobal();
  response.json(await describe(originOf(request, baseUrl)));
};
