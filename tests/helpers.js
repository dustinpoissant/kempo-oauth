import crypto from 'crypto';
import http from 'http';
import { eq, like } from 'drizzle-orm';
import { createUser, db, deleteUser, schema, setSetting } from 'kempo/server/sdk.js';
import { kempoOauthAccount } from '../server/db/schema.js';
import { registerProvider, unregisterProvider } from '../server/providers/index.js';

/*
  Shared scaffolding for the suites that need a database: stand-ins for kempo's request and
  response, a throwaway user factory, and a local server that plays the part of a provider.
*/

export const EMAIL_PREFIX = 'oauthtest-';

export const fakeRequest = ({ query = {}, params = {}, cookies = {}, headers = {}, body = null } = {}) => ({
  query,
  params,
  cookies,
  body,
  headers: { host: 'localhost:9876', ...headers },
});

/*
  Records what a route did rather than sending it. `cookie()` stores the value URL-encoded, which is
  what kempo-server writes onto the wire and what a browser then hands back — the round trip in
  the flow suite relies on that, because the real cookie parser does not decode.
*/
export const fakeResponse = () => {
  const res = {
    statusCode: 200,
    body: undefined,
    redirectedTo: null,
    cookies: [],
    status(code){
      res.statusCode = code;
      return res;
    },
    json(body){
      res.body = body;
      return res;
    },
    cookie(name, value, options = {}){
      res.cookies.push({ name, value: encodeURIComponent(value), options });
      return res;
    },
    redirect(url, code = 302){
      res.redirectedTo = url;
      res.statusCode = code;
      return res;
    },
  };
  return res;
};

export const cookieNamed = (res, name) => res.cookies.filter(cookie => cookie.name === name).at(-1);

export const makeUser = async (suffix, { password = 'a-password-nobody-guesses', emailVerified = true } = {}) => {
  const email = `${EMAIL_PREFIX}${suffix}-${crypto.randomBytes(4).toString('hex')}@example.com`;
  const [error, created] = await createUser({ name: `Test ${suffix}`, email, password, emailVerified });
  if(error) throw new Error(error.msg);
  return { ...created.user, password };
};

export const purge = async () => {
  await db.delete(kempoOauthAccount);
  const users = await db.select({ id: schema.user.id }).from(schema.user).where(like(schema.user.email, `${EMAIL_PREFIX}%@example.com`));
  for(const user of users) await deleteUser(user.id);
};

/*
  Sets a kempo `system` setting for the length of a callback and puts back what was there. The test
  database may or may not have been seeded with these, so the previous row is read and restored
  rather than assumed absent.
*/
export const withSystemSetting = async (name, value, type, fn) => {
  const full = `system:${name}`;
  const [previous] = await db.select().from(schema.setting).where(eq(schema.setting.name, full)).limit(1);

  await setSetting('system', name, value, type, false, null);
  try {
    return await fn();
  } finally {
    if(previous){
      await db.update(schema.setting).set({ value: previous.value }).where(eq(schema.setting.name, full));
    } else {
      // Not deleteSetting: kempo refuses to delete anything owned by `system`.
      await db.delete(schema.setting).where(eq(schema.setting.name, full));
    }
  }
};

/*
  A provider on localhost.

  It verifies the parts of the exchange that a real provider verifies and the code under test could
  get wrong: the authorization code is one it issued and is single-use, the client credentials
  arrive the way the provider says they must (form body or HTTP Basic), and — the part that would
  otherwise only fail against a real provider — the PKCE verifier hashes to the challenge that was
  sent on the authorize URL.
*/
export const startFakeProvider = async () => {
  const state = {
    codes: new Map(),
    challenge: null,
    profile: { id: 'fake-1', email: 'someone@example.com', emailVerified: true, name: 'Some One' },
    tokenReply: null,
    calls: [],
  };

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if(req.url === '/token' && req.method === 'POST'){
      const form = new URLSearchParams(raw);
      const call = { form: Object.fromEntries(form), authorization: req.headers.authorization || null };
      state.calls.push(call);

      if(state.tokenReply) return send(state.tokenReply.status, state.tokenReply.body);
      if(!state.codes.has(form.get('code'))) return send(400, { error: 'invalid_grant' });
      state.codes.delete(form.get('code'));

      if(state.challenge){
        const digest = crypto.createHash('sha256').update(form.get('code_verifier') || '').digest('base64url');
        if(digest !== state.challenge) return send(400, { error: 'invalid_grant', error_description: 'PKCE verifier does not match the challenge' });
      }

      return send(200, { access_token: 'access-token-1', token_type: 'bearer' });
    }

    if(req.url === '/userinfo'){
      if(req.headers.authorization !== 'Bearer access-token-1') return send(401, { error: 'bad token' });
      return send(200, state.profile);
    }

    send(404, { error: 'not found' });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  const provider = {
    name: 'fake',
    label: 'Fake',
    icon: 'google.svg',
    mono: false,
    consoleUrl: url,
    scopes: ['openid', 'email'],
    scopeSeparator: ' ',
    pkce: true,
    clientAuth: 'body',
    authorizeParams: {},
    extraFields: [],
    endpoints: () => ({ authorize: `${url}/authorize`, token: `${url}/token` }),
    profile: async ({ accessToken, http: client }) => {
      const [error, data] = await client.getJson(`${url}/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } });
      return error ? [error, null] : [null, data];
    },
  };

  registerProvider(provider);

  return {
    url,
    state,
    provider,
    issueCode: () => {
      const code = crypto.randomBytes(8).toString('hex');
      state.codes.set(code, true);
      return code;
    },
    close: async () => {
      unregisterProvider('fake');
      await new Promise(resolve => server.close(resolve));
    },
  };
};
