export default {
  name: 'microsoft',
  label: 'Microsoft',
  icon: 'microsoft.svg',
  mono: false,
  consoleUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
  scopes: ['openid', 'email', 'profile'],
  scopeSeparator: ' ',
  pkce: true,
  clientAuth: 'body',
  authorizeParams: {},
  extraFields: [
    {
      name: 'tenant',
      label: 'Tenant',
      help: '"common" lets any Microsoft account sign in. An app registered for one organisation only must use that organisation’s tenant id instead, or Microsoft refuses every sign-in.',
      default: 'common',
    },
  ],

  endpoints: config => {
    // A tenant is a GUID, a domain, or one of four keywords — never anything that can contain a slash.
    const tenant = /^[A-Za-z0-9.-]+$/.test(config.tenant || '') ? config.tenant : 'common';
    return {
      authorize: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    };
  },

  profile: async ({ accessToken, http }) => {
    const [error, data] = await http.getJson('https://graph.microsoft.com/oidc/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if(error) return [error, null];
    if(!data?.sub) return [{ code: 502, msg: 'Microsoft did not say who signed in' }, null];

    return [null, {
      id: String(data.sub),
      email: data.email || null,
      // An address on a Microsoft account is not proof the person owns it — the directory lets an
      // administrator set one freely — so it is never trusted to attach to an existing account.
      emailVerified: false,
      name: data.name || null,
      avatarUrl: data.picture || null,
    }];
  },
};
