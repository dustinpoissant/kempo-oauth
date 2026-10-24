import safePath from '../server/utils/flow/safePath.js';
import { challengeFor, randomToken } from '../server/utils/flow/pkce.js';
import { decodeState, encodeState, sameState } from '../server/utils/flow/state.js';
import { buildAuthorizeUrl, exchangeCode } from '../server/utils/flow/exchange.js';
import originOf from '../server/http/origin.js';
import { listProviders } from '../server/providers/index.js';

/*
  The pieces of the authorization-code flow that need no database and no network: what is allowed
  to be a redirect target, what the state cookie carries, how the authorize URL and the token
  request are built for each provider.
*/

const config = { clientId: 'the-client-id', clientSecret: 's3cret/with+odd:chars', extra: { tenant: 'common' } };

// A provider's `http`, recording the one request it is asked to make.
const recordingHttp = reply => {
  const seen = {};
  return {
    seen,
    postForm: async (url, form, { headers }) => {
      Object.assign(seen, { url, form: Object.fromEntries(form), headers });
      return reply ? [null, reply] : [null, { access_token: 'tok' }];
    },
  };
};

export default {
  /*
    Redirect targets
  */

  'safePath keeps a path on this site': async ({ pass, fail }) => {
    for(const value of ['/', '/account', '/a/b?c=d#e', '/shop/items?page=2']){
      if(safePath(value) !== value) return fail(`${value} is a path on this site and was refused`);
    }
    pass('ordinary paths survive');
  },

  'safePath refuses everything that could leave the site': async ({ pass, fail }) => {
    const hostile = [
      'https://evil.example', '//evil.example', '/\\evil.example', '\\\\evil.example', 'evil.example',
      'javascript:alert(1)', '/ok\r\nSet-Cookie: x=1', '/ok\nLocation: https://evil.example', '', ' /leading-space',
      null, undefined, 42, {}, ['/a'], `/${'a'.repeat(3000)}`,
    ];
    for(const value of hostile){
      if(safePath(value) !== '') return fail(`${JSON.stringify(value)?.slice(0, 60)} was accepted as a redirect target`);
    }
    pass(`${hostile.length} hostile values all refused`);
  },

  /*
    The state cookie
  */

  'the flow state survives the trip through a cookie': async ({ pass, fail }) => {
    const state = { state: 's', verifier: 'v', provider: 'google', redirectUri: 'https://x.example/oauth/api/callback/google', mode: 'register', next: '/shop' };
    const roundTrip = decodeState(encodeURIComponent(encodeState(state)));
    if(JSON.stringify(roundTrip) !== JSON.stringify(state)) return fail(`came back as ${JSON.stringify(roundTrip)}`);
    pass('every field intact');
  },

  'a cookie that is missing, mangled or the wrong shape decodes to nothing': async ({ pass, fail }) => {
    const bad = [undefined, null, '', 'not base64 json', encodeState({ state: 1 }), encodeState([]), encodeState({ state: 's', verifier: 'v', provider: 'p', redirectUri: 'r', next: '', mode: 'admin' })];
    for(const value of bad){
      if(decodeState(value) !== null) return fail(`${String(value).slice(0, 40)} decoded to something`);
    }
    pass('all rejected, none thrown');
  },

  'sameState compares exactly and rejects anything that is not a matching string': async ({ pass, fail }) => {
    if(!sameState('abc', 'abc')) return fail('equal strings did not match');
    for(const [a, b] of [['abc', 'abd'], ['abc', 'ab'], ['', ''], [undefined, undefined], [undefined, 'abc'], ['abc', undefined], [1, 1]]){
      if(sameState(a, b)) return fail(`${JSON.stringify([a, b])} matched`);
    }
    pass('only identical non-empty strings match');
  },

  /*
    PKCE
  */

  'the PKCE challenge matches the worked example in RFC 7636 appendix B': async ({ pass, fail }) => {
    const challenge = challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    if(challenge !== 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM') return fail(`got ${challenge}`);
    pass('S256 is implemented the way providers expect');
  },

  'random tokens are url-safe, long enough and never repeat': async ({ pass, fail }) => {
    const seen = new Set();
    for(let i = 0; i < 200; i++){
      const token = randomToken();
      if(!/^[A-Za-z0-9_-]{43}$/.test(token)) return fail(`${token} is not 32 bytes of base64url`);
      seen.add(token);
    }
    if(seen.size !== 200) return fail('a token repeated');
    pass('200 distinct 256-bit tokens');
  },

  /*
    The authorize URL
  */

  'every provider builds an authorize URL with the parameters it needs': async ({ pass, fail }) => {
    for(const provider of listProviders()){
      const url = new URL(buildAuthorizeUrl({ provider, config, redirectUri: 'https://x.example/cb', state: 'STATE', challenge: 'CHALLENGE' }));
      const q = url.searchParams;

      if(q.get('client_id') !== config.clientId) return fail(`${provider.name}: client_id missing`);
      if(q.get('redirect_uri') !== 'https://x.example/cb') return fail(`${provider.name}: redirect_uri missing`);
      if(q.get('response_type') !== 'code') return fail(`${provider.name}: response_type should be code`);
      if(q.get('state') !== 'STATE') return fail(`${provider.name}: state missing`);
      if(q.get('scope') !== provider.scopes.join(provider.scopeSeparator)) return fail(`${provider.name}: scope wrong`);

      if(provider.pkce && (q.get('code_challenge') !== 'CHALLENGE' || q.get('code_challenge_method') !== 'S256')) return fail(`${provider.name}: PKCE challenge missing`);
      if(!provider.pkce && q.has('code_challenge')) return fail(`${provider.name}: sent a PKCE challenge it does not use`);
    }
    pass(`${listProviders().length} providers`);
  },

  'Facebook scopes are comma-separated and the others space-separated': async ({ pass, fail }) => {
    const scope = name => new URL(buildAuthorizeUrl({
      provider: listProviders().find(provider => provider.name === name), config, redirectUri: 'https://x.example/cb', state: 's', challenge: 'c',
    })).searchParams.get('scope');

    if(scope('facebook') !== 'email,public_profile') return fail(`facebook: ${scope('facebook')}`);
    if(scope('google') !== 'openid email profile') return fail(`google: ${scope('google')}`);
    pass('separators match each provider’s documentation');
  },

  /*
    The token exchange
  */

  'a body-auth provider sends the secret in the form and a PKCE verifier when it uses PKCE': async ({ pass, fail }) => {
    const google = listProviders().find(provider => provider.name === 'google');
    const http = recordingHttp();

    const [error] = await exchangeCode({ provider: google, config, code: 'CODE', redirectUri: 'https://x.example/cb', verifier: 'VERIFIER', http });
    if(error) return fail(error.msg);

    const { form, headers } = http.seen;
    if(form.client_secret !== config.clientSecret) return fail('client_secret should be in the form');
    if(headers.Authorization) return fail('sent Basic auth to a body-auth provider');
    if(form.code_verifier !== 'VERIFIER' || form.code !== 'CODE' || form.grant_type !== 'authorization_code') return fail(`form was ${JSON.stringify(form)}`);
    pass('form carries code, verifier and secret');
  },

  'a Basic-auth provider encodes the credentials and keeps the secret out of the form': async ({ pass, fail }) => {
    const x = listProviders().find(provider => provider.name === 'x');
    const http = recordingHttp();

    const [error] = await exchangeCode({ provider: x, config, code: 'CODE', redirectUri: 'https://x.example/cb', verifier: 'V', http });
    if(error) return fail(error.msg);

    const expected = `Basic ${Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`).toString('base64')}`;
    if(http.seen.headers.Authorization !== expected) return fail(`Authorization was ${http.seen.headers.Authorization}`);
    if('client_secret' in http.seen.form) return fail('the secret is also in the form body');
    pass('RFC 6749 §2.3.1 encoding, secret only in the header');
  },

  'a provider that does not use PKCE is not sent a verifier': async ({ pass, fail }) => {
    const github = listProviders().find(provider => provider.name === 'github');
    const http = recordingHttp();

    await exchangeCode({ provider: github, config, code: 'CODE', redirectUri: 'https://x.example/cb', verifier: 'V', http });
    if('code_verifier' in http.seen.form) return fail('sent code_verifier to a provider that does not use PKCE');
    pass('verifier omitted');
  },

  'an error inside an HTTP 200 reply is an error': async ({ pass, fail }) => {
    const github = listProviders().find(provider => provider.name === 'github');

    for(const reply of [{ error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' }, {}, { token_type: 'bearer' }]){
      const [error, token] = await exchangeCode({ provider: github, config, code: 'C', redirectUri: 'r', verifier: 'v', http: recordingHttp(reply) });
      if(!error || token) return fail(`${JSON.stringify(reply)} was accepted as a token`);
    }
    pass('GitHub-style failures are caught');
  },

  /*
    Where this site is
  */

  'the configured site address wins over whatever the request says': async ({ pass, fail }) => {
    const request = { headers: { host: 'internal:3000', 'x-forwarded-proto': 'http' } };
    if(originOf(request, 'https://example.com') !== 'https://example.com') return fail('the setting was ignored');
    pass('base_url wins');
  },

  'without a configured address the origin comes from the request': async ({ pass, fail }) => {
    if(originOf({ headers: { host: 'localhost:9876' } }, '') !== 'http://localhost:9876') return fail('plain request');
    if(originOf({ headers: { host: 'example.com', 'x-forwarded-proto': 'https' } }, '') !== 'https://example.com') return fail('proxied request');
    if(originOf({ headers: { host: 'example.com', 'x-forwarded-proto': 'https,http' } }, '') !== 'https://example.com') return fail('first forwarded protocol should win');
    pass('scheme and host are read');
  },
};
