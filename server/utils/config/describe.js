import { listProviders } from '../../providers/index.js';
import { readGlobal, readProvider } from './settings.js';

/*
  Everything the admin screen renders, and not one character of a client secret.

  A secret comes back as a boolean — whether it is set — rather than a masked string. Masking in
  the response and hoping nothing logs it is a weaker promise than never putting it in the response
  at all, and the screen has no use for the value anyway: editing a secret is replace-only.

  `redirectUri` is what the site owner pastes into the provider's console, so it is built the same
  way the flow builds it (from `origin`, which is the configured base URL or the request's own).
*/
export default async origin => {
  const global = await readGlobal();
  const privacyUrl = `${origin}/privacy/`;

  const providers = await Promise.all(listProviders().map(async provider => {
    const config = await readProvider(provider);
    return {
      name: provider.name,
      label: provider.label,
      icon: provider.icon,
      mono: !!provider.mono,
      consoleUrl: provider.consoleUrl,
      redirectUri: `${origin}/oauth/api/callback/${provider.name}`,
      links: [
        ...(provider.privacyField ? [{ key: 'privacy', label: 'Privacy policy URL', help: provider.name === 'facebook' ? 'Facebook will not let the app go live without one.' : 'Used for the app’s details on the provider’s consent screen.', url: privacyUrl }] : []),
        ...(provider.deletion ? [{ key: 'deletion', label: 'Data deletion request callback URL', help: 'Called by the provider, with a signed request, when someone removes the app. Everything this site holds for that person is deleted.', url: `${origin}/oauth/api/data-deletion/${provider.name}` }] : []),
      ],
      enabled: config.enabled,
      clientId: config.clientId,
      hasSecret: !!config.clientSecret,
      configured: config.configured,
      active: config.active,
      extraFields: provider.extraFields.map(field => ({ ...field, value: config.extra[field.name] })),
    };
  }));

  return {
    global,
    privacyUrl,
    providers,
    encryptionConfigured: !!process.env.SETTINGS_ENCRYPTION_KEY,
  };
};
