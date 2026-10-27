export default {
  name: 'x',
  label: 'X (Twitter)',
  icon: 'x.svg',
  mono: true,
  consoleUrl: 'https://developer.x.com/en/portal/dashboard',
  // Whether the provider's own console asks for a privacy policy URL (checked against each console, not assumed).
  privacyField: false,
  // users.read cannot be granted without tweet.read.
  scopes: ['users.read', 'tweet.read'],
  scopeSeparator: ' ',
  // Not optional: X rejects an authorisation request that has no PKCE challenge.
  pkce: true,
  // X's token endpoint wants the client credentials as HTTP Basic, not in the form.
  clientAuth: 'basic',
  authorizeParams: {},
  extraFields: [],

  endpoints: () => ({
    authorize: 'https://x.com/i/oauth2/authorize',
    token: 'https://api.x.com/2/oauth2/token',
  }),

  profile: async ({ accessToken, http }) => {
    const [error, data] = await http.getJson('https://api.x.com/2/users/me?user.fields=profile_image_url', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if(error) return [error, null];
    const user = data?.data;
    if(!user?.id) return [{ code: 502, msg: 'X did not say who signed in' }, null];

    /*
      X's OAuth 2.0 flow cannot share an email address at all. The sign-in asks the person for one and
      proves it with a code before any account is made (see accounts/pending.js).
    */
    return [null, {
      id: String(user.id),
      email: null,
      emailVerified: false,
      name: user.name || user.username || null,
      avatarUrl: user.profile_image_url || null,
    }];
  },
};
