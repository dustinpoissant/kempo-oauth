import defaultHttp from './http.js';

/*
  The two server-to-server steps of the authorization-code flow: build the URL the visitor is sent
  to, and, when they come back with a code, trade it for an access token and read who they are.
*/

export const buildAuthorizeUrl = ({ provider, config, redirectUri, state, challenge }) => {
  const url = new URL(provider.endpoints(config.extra).authorize);

  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', provider.scopes.join(provider.scopeSeparator || ' '));
  url.searchParams.set('state', state);

  if(provider.pkce){
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }

  for(const [key, value] of Object.entries(provider.authorizeParams || {})) url.searchParams.set(key, value);

  return url.toString();
};

export const exchangeCode = async ({ provider, config, code, redirectUri, verifier, http = defaultHttp }) => {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
  });
  const headers = {};

  if(provider.clientAuth === 'basic'){
    // RFC 6749 §2.3.1: the id and secret are form-encoded *before* being base64'd.
    headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`).toString('base64')}`;
  } else {
    form.set('client_secret', config.clientSecret);
  }

  if(provider.pkce) form.set('code_verifier', verifier);

  const [error, token] = await http.postForm(provider.endpoints(config.extra).token, form, { headers });
  if(error) return [error, null];

  /*
    Several providers (GitHub is the well-known one) answer a bad or reused code with HTTP 200 and
    an `error` field, so a 2xx proves nothing until the body has been looked at.
  */
  if(token.error || !token.access_token){
    return [{ code: 502, msg: 'The sign-in provider did not accept the sign-in', detail: String(token.error_description || token.error || 'no access_token in reply').slice(0, 300) }, null];
  }

  return [null, token];
};

export const fetchProfile = async ({ provider, tokenResponse, http = defaultHttp }) => {
  const [error, profile] = await provider.profile({ accessToken: tokenResponse.access_token, tokenResponse, http });
  if(error) return [error, null];

  return [null, {
    id: profile.id,
    email: typeof profile.email === 'string' && profile.email.includes('@') ? profile.email.trim().toLowerCase() : null,
    emailVerified: profile.emailVerified === true,
    name: profile.name || null,
    avatarUrl: profile.avatarUrl || null,
  }];
};
