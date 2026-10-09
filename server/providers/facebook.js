/*
  Graph API version. Facebook retires a version about two years after release and quietly serves the
  next one for a request that names a retired version, so this keeps working past that date — but it
  is the one number here to look at first if Facebook sign-in ever starts misbehaving.
*/
const VERSION = 'v21.0';

export default {
  name: 'facebook',
  label: 'Facebook',
  icon: 'facebook.svg',
  mono: false,
  consoleUrl: 'https://developers.facebook.com/apps/',
  // Facebook's scopes are comma-separated.
  scopes: ['email', 'public_profile'],
  scopeSeparator: ',',
  pkce: false,
  clientAuth: 'body',
  authorizeParams: {},
  extraFields: [],

  endpoints: () => ({
    authorize: `https://www.facebook.com/${VERSION}/dialog/oauth`,
    token: `https://graph.facebook.com/${VERSION}/oauth/access_token`,
  }),

  profile: async ({ accessToken, http }) => {
    const url = `https://graph.facebook.com/${VERSION}/me?${new URLSearchParams({ fields: 'id,name,email,picture.type(large)' })}`;
    const [error, data] = await http.getJson(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if(error) return [error, null];
    if(!data?.id) return [{ code: 502, msg: 'Facebook did not say who signed in' }, null];

    return [null, {
      id: String(data.id),
      email: data.email || null,
      // Facebook returns an address but never says whether it was confirmed, so it is never trusted
      // to attach to an account that already exists.
      emailVerified: false,
      name: data.name || null,
      avatarUrl: data.picture?.data?.url || null,
    }];
  },
};
