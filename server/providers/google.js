export default {
  name: 'google',
  label: 'Google',
  icon: 'google.svg',
  mono: false,
  consoleUrl: 'https://console.cloud.google.com/apis/credentials',
  scopes: ['openid', 'email', 'profile'],
  scopeSeparator: ' ',
  pkce: true,
  clientAuth: 'body',
  authorizeParams: { prompt: 'select_account' },
  extraFields: [],

  endpoints: () => ({
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
  }),

  profile: async ({ accessToken, http }) => {
    const [error, data] = await http.getJson('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if(error) return [error, null];
    if(!data?.sub) return [{ code: 502, msg: 'Google did not say who signed in' }, null];

    return [null, {
      id: String(data.sub),
      email: data.email || null,
      // Google states this outright, and it is false for an address added but never confirmed.
      emailVerified: data.email_verified === true,
      name: data.name || null,
      avatarUrl: data.picture || null,
    }];
  },
};
