export default {
  name: 'github',
  label: 'GitHub',
  icon: 'github.svg',
  mono: true,
  consoleUrl: 'https://github.com/settings/developers',
  // Whether the provider's own console asks for a privacy policy URL (checked against each console, not assumed).
  privacyField: false,
  scopes: ['read:user', 'user:email'],
  scopeSeparator: ' ',
  pkce: false,
  clientAuth: 'body',
  authorizeParams: {},
  extraFields: [],

  endpoints: () => ({
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
  }),

  profile: async ({ accessToken, http }) => {
    // GitHub rejects a request with no User-Agent outright.
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'kempo-oauth',
    };

    const [error, data] = await http.getJson('https://api.github.com/user', { headers });
    if(error) return [error, null];
    if(data?.id === undefined || data?.id === null) return [{ code: 502, msg: 'GitHub did not say who signed in' }, null];

    /*
      The email on /user is whatever the person chose to make public, which is usually nothing, and
      it carries no verification flag. /user/emails lists every address with one, so that is where
      the email comes from — and only a verified one is used at all. A failure here (the person
      withheld the scope, or the call is blocked) means "no email", not a failed sign-in.
    */
    let email = null;
    const [emailsError, emails] = await http.getJson('https://api.github.com/user/emails', { headers });
    if(!emailsError && Array.isArray(emails)){
      const verified = emails.filter(entry => entry?.verified && entry?.email);
      email = (verified.find(entry => entry.primary) || verified[0])?.email || null;
    }

    return [null, {
      id: String(data.id),
      email,
      emailVerified: !!email,
      name: data.name || data.login || null,
      avatarUrl: data.avatar_url || null,
    }];
  },
};
