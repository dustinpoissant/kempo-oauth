import { getSetting } from 'kempo/server/sdk.js';
import { listProviders } from '../../providers/index.js';
import safePath from '../flow/safePath.js';

export const OWNER = 'kempo-oauth';

export const DEFAULTS = {
  baseUrl: '',
  afterLoginPath: '/account',
  linkVerifiedEmails: true,
  privacyOperator: '',
  privacyContactEmail: '',
};

/*
  Setting names are `<provider>_<field>` — `google_client_id`, `x_client_secret`. One function so
  the settings route, the readers below and the static test that checks kempo-config.json can never
  disagree about what a field is called.
*/
export const settingName = (provider, field) => `${provider.name}_${field}`;

export const fieldNames = provider => [
  settingName(provider, 'enabled'),
  settingName(provider, 'client_id'),
  settingName(provider, 'client_secret'),
  ...provider.extraFields.map(field => settingName(provider, field.name)),
];

const read = async (name, fallback) => {
  const [error, value] = await getSetting(OWNER, name, fallback);
  return error ? fallback : value;
};

export const readGlobal = async () => {
  const [baseUrl, afterLoginPath, linkVerifiedEmails, privacyOperator, privacyContactEmail] = await Promise.all([
    read('base_url', DEFAULTS.baseUrl),
    read('after_login_path', DEFAULTS.afterLoginPath),
    read('link_verified_emails', DEFAULTS.linkVerifiedEmails),
    read('privacy_operator', DEFAULTS.privacyOperator),
    read('privacy_contact_email', DEFAULTS.privacyContactEmail),
  ]);

  return {
    baseUrl: String(baseUrl || '').trim().replace(/\/+$/, ''),
    afterLoginPath: safePath(afterLoginPath) || DEFAULTS.afterLoginPath,
    linkVerifiedEmails: linkVerifiedEmails !== false,
    privacyOperator: String(privacyOperator || '').trim(),
    privacyContactEmail: String(privacyContactEmail || '').trim(),
  };
};

/*
  One provider's stored configuration, with the secret included — this is for server-side code that
  is about to talk to the provider. Anything that answers a browser must use `describeProvider`
  instead, which reports whether the secret is set and never what it is.

  `active` is the only question the rest of the extension asks: is this provider switched on *and*
  complete. Half a configuration (an id with no secret) is not a provider that fails at the
  provider's end with an opaque error — it is simply not offered.
*/
export const readProvider = async provider => {
  const extra = {};
  for(const field of provider.extraFields){
    extra[field.name] = String(await read(settingName(provider, field.name), field.default) || field.default);
  }

  const [enabled, clientId, clientSecret] = await Promise.all([
    read(settingName(provider, 'enabled'), false),
    read(settingName(provider, 'client_id'), ''),
    read(settingName(provider, 'client_secret'), ''),
  ]);

  const config = {
    enabled: enabled === true,
    clientId: String(clientId || '').trim(),
    clientSecret: String(clientSecret || '').trim(),
    extra,
  };

  config.configured = !!(config.clientId && config.clientSecret);
  config.active = config.enabled && config.configured;

  return config;
};

export const activeProviders = async () => {
  const entries = await Promise.all(listProviders().map(async provider => ({ provider, config: await readProvider(provider) })));
  return entries.filter(entry => entry.config.active);
};
