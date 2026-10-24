import crypto from 'crypto';
import { eq, like } from 'drizzle-orm';
import { createSession, db, deleteSetting, getSession, schema, setSetting } from 'kempo/server/sdk.js';
import { kempoOauthAccount } from '../server/db/schema.js';
import start from '../public/api/start/[provider]/GET.js';
import callback from '../public/api/callback/[provider]/GET.js';
import listProvidersRoute from '../public/api/providers/GET.js';
import getSettingsRoute from '../public/api/settings/GET.js';
import putSettingsRoute from '../public/api/settings/PUT.js';
import accountsRoute from '../public/api/accounts/GET.js';
import disconnectRoute from '../public/api/accounts/[id]/DELETE.js';
import { databaseReachable, encryptionAvailable, skipReason } from './testDatabase.js';
import { cookieNamed, fakeRequest, fakeResponse, makeUser, purge, startFakeProvider } from './helpers.js';

/*
  The whole sign-in, driven through the real route handlers against a provider running on localhost.

  The fake provider verifies the things a real one does and this code could get wrong — the code is
  one it issued and works once, the credentials arrive the way it says, and the PKCE verifier hashes
  to the challenge that was on the authorize URL — so a pass here means the three legs fit together,
  not just that each compiles.

  Needs a *_test database and SETTINGS_ENCRYPTION_KEY (a client secret is a `secret` setting).
*/

const skipped = reason => ({
  'routes (SKIPPED)': async ({ pass }) => pass(`skipped: ${reason}`),
});

const PROVIDER_SETTINGS = ['enabled', 'client_id', 'client_secret'];
const GLOBAL_SETTINGS = ['base_url', 'after_login_path', 'link_verified_emails', 'privacy_operator', 'privacy_contact_email', 'privacy_policy_url'];
const SECRET = 'fake-client-secret-value';

const configureFake = async ({ enabled = true } = {}) => {
  await setSetting('kempo-oauth', 'fake_enabled', enabled, 'boolean', false, null);
  await setSetting('kempo-oauth', 'fake_client_id', 'fake-client-id', 'string', false, null);
  await setSetting('kempo-oauth', 'fake_client_secret', SECRET, 'secret', false, null);
};

const resetSettings = async () => {
  for(const name of PROVIDER_SETTINGS) for(const provider of ['fake', 'google']) await deleteSetting('kempo-oauth', `${provider}_${name}`);
  for(const name of GLOBAL_SETTINGS) await deleteSetting('kempo-oauth', name);
};

const begin = async ({ mode, next, provider = 'fake' } = {}) => {
  const res = fakeResponse();
  await start(fakeRequest({ params: { provider }, query: { mode, next } }), res);
  return res;
};

// The authorize URL's query, and the cookie the browser would hold, from a finished `begin`.
const leg = res => {
  const url = res.redirectedTo.startsWith('http') ? new URL(res.redirectedTo) : null;
  return { url, state: url?.searchParams.get('state'), challenge: url?.searchParams.get('code_challenge'), cookie: cookieNamed(res, 'kempo_oauth') };
};

const finish = async ({ cookie, state, code, error, provider = 'fake' }) => {
  const res = fakeResponse();
  await callback(fakeRequest({
    params: { provider },
    query: { state, ...(code ? { code } : {}), ...(error ? { error } : {}) },
    cookies: cookie ? { kempo_oauth: cookie.value } : {},
  }), res);
  return res;
};

// A whole sign-in in one call.
const signInWith = async (fake, { mode, next, profile } = {}) => {
  if(profile) fake.state.profile = profile;
  const started = leg(await begin({ mode, next }));
  fake.state.challenge = started.challenge;
  return finish({ cookie: started.cookie, state: started.state, code: fake.issueCode() });
};

const ensureRbac = async () => {
  // Every user implicitly belongs to this group; init-db.js seeds it, and a bare test database has none.
  await db.insert(schema.group).values({ name: 'system:Users', description: 'Every user', owner: 'system', createdAt: new Date() }).onConflictDoNothing();
  await db.insert(schema.permission).values(['oauth:view', 'oauth:unlink', 'oauth:settings'].map(name => ({ name, description: name, owner: 'kempo-oauth', createdAt: new Date() }))).onConflictDoNothing();
};

const adminWith = async (permissions, suffix) => {
  await ensureRbac();
  const user = await makeUser(suffix);
  const group = `oauthtest-group-${suffix}-${crypto.randomBytes(3).toString('hex')}`;

  await db.insert(schema.group).values({ name: group, description: 'test', owner: 'oauthtest', createdAt: new Date() });
  for(const permission of permissions){
    await db.insert(schema.groupPermission).values({ id: crypto.randomBytes(8).toString('hex'), groupName: group, permissionName: permission, createdAt: new Date() });
  }
  await db.insert(schema.userGroup).values({ id: crypto.randomBytes(8).toString('hex'), userId: user.id, groupName: group, createdAt: new Date() });

  const [, session] = await createSession(user.id);
  return { user, group, token: session.sessionToken };
};

const dropGroups = async () => {
  const groups = await db.select({ name: schema.group.name }).from(schema.group).where(like(schema.group.name, 'oauthtest-group-%'));
  for(const { name } of groups){
    await db.delete(schema.userGroup).where(eq(schema.userGroup.groupName, name));
    await db.delete(schema.groupPermission).where(eq(schema.groupPermission.groupName, name));
    await db.delete(schema.group).where(eq(schema.group.name, name));
  }
};

const as = (token, extra = {}) => fakeRequest({ cookies: token ? { session_token: token } : {}, ...extra });

export default !databaseReachable ? skipped(`${skipReason} — point DATABASE_URL at a *_test database and run drizzle-kit push`)
  : !encryptionAvailable ? skipped('SETTINGS_ENCRYPTION_KEY is not set, so a client secret cannot be stored')
  : {
    /*
      The sign-in
    */

    'a complete sign-in: start, provider, callback, session': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await configureFake();
      const fake = await startFakeProvider();

      try {
        const res = await begin({ mode: 'login' });
        const { url, state, challenge, cookie } = leg(res);

        if(res.statusCode !== 302 || !url) return fail(`start did not redirect to the provider: ${res.statusCode} ${res.redirectedTo}`);
        if(url.origin !== fake.url || url.pathname !== '/authorize') return fail(`sent the visitor to ${res.redirectedTo}`);
        if(url.searchParams.get('client_id') !== 'fake-client-id') return fail('client_id missing from the authorize URL');
        if(url.searchParams.get('redirect_uri') !== 'http://localhost:9876/oauth/api/callback/fake') return fail(`redirect_uri was ${url.searchParams.get('redirect_uri')}`);
        if(!state || !challenge) return fail('state or PKCE challenge missing');
        if(JSON.stringify(url.search).includes(SECRET)) return fail('the client secret is on the authorize URL');

        if(!cookie?.options.httpOnly || cookie.options.sameSite !== 'lax' || cookie.options.path !== '/oauth/api') return fail(`flow cookie options: ${JSON.stringify(cookie?.options)}`);
        if(cookie.options.secure) return fail('flow cookie is Secure on an http site');

        fake.state.challenge = challenge;
        fake.state.profile = { id: 'fake-1', email: 'someone@example.com', emailVerified: true, name: 'Some One' };
        const back = await finish({ cookie, state, code: fake.issueCode() });

        if(back.redirectedTo !== '/account') return fail(`landed on ${back.redirectedTo} (${back.statusCode})`);

        const session = cookieNamed(back, 'session_token');
        if(!session || !session.options.httpOnly || session.options.sameSite !== 'lax' || session.options.path !== '/') return fail(`session cookie: ${JSON.stringify(session)}`);
        if(!(session.options.maxAge > 0 && session.options.maxAge < 60 * 60 * 24 * 400)) return fail(`maxAge ${session.options.maxAge} should be seconds`);

        const [error, current] = await getSession({ token: decodeURIComponent(session.value) });
        if(error || current.user.email !== 'someone@example.com') return fail('the session cookie does not log anybody in');

        const cleared = cookieNamed(back, 'kempo_oauth');
        if(!cleared || cleared.value !== '' || cleared.options.maxAge !== 1) return fail('the flow cookie was left behind');

        const call = fake.state.calls.at(-1);
        if(call.form.client_secret !== SECRET || call.form.client_id !== 'fake-client-id') return fail('client credentials were not sent to the token endpoint');

        pass('every leg fits, PKCE verified by the provider');
      } finally {
        await fake.close();
        await resetSettings();
        await purge();
      }
    },

    'a safe `next` is honoured and an unsafe one is not': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await configureFake();
      const fake = await startFakeProvider();

      try {
        const good = await signInWith(fake, { next: '/shop/items?page=2' });
        if(good.redirectedTo !== '/shop/items?page=2') return fail(`a same-site next was ignored: ${good.redirectedTo}`);

        for(const hostile of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']){
          const back = await signInWith(fake, { next: hostile });
          if(back.redirectedTo !== '/account') return fail(`next=${hostile} led to ${back.redirectedTo}`);
        }

        pass('open redirects refused, ordinary paths kept');
      } finally {
        await fake.close();
        await resetSettings();
        await purge();
      }
    },

    'the after-sign-in page comes from the setting': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await configureFake();
      await setSetting('kempo-oauth', 'after_login_path', '/dashboard', 'string', false, null);
      const fake = await startFakeProvider();

      try {
        const back = await signInWith(fake);
        if(back.redirectedTo !== '/dashboard') return fail(`landed on ${back.redirectedTo}`);
        pass('/dashboard');
      } finally {
        await fake.close();
        await resetSettings();
        await purge();
      }
    },

    /*
      The ways it must not work
    */

    'a callback whose state does not match is refused before the provider is contacted': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await configureFake();
      const fake = await startFakeProvider();

      try {
        const started = leg(await begin());
        const before = fake.state.calls.length;

        for(const [label, args] of [
          ['a different state', { cookie: started.cookie, state: 'forged', code: fake.issueCode() }],
          ['no state', { cookie: started.cookie, state: undefined, code: fake.issueCode() }],
          ['no cookie at all', { cookie: null, state: started.state, code: fake.issueCode() }],
        ]){
          const res = await finish(args);
          if(!res.redirectedTo.startsWith('/login?oauth_error=state')) return fail(`${label}: landed on ${res.redirectedTo}`);
          if(cookieNamed(res, 'session_token')) return fail(`${label}: a session was issued`);
        }

        if(fake.state.calls.length !== before) return fail('the token endpoint was called for a request that failed the state check');
        pass('three forgeries, no token request, no session');
      } finally {
        await fake.close();
        await resetSettings();
        await purge();
      }
    },

    'a flow started for one provider cannot be completed as another': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await configureFake();
      const fake = await startFakeProvider();

      try {
        const started = leg(await begin());
        const res = await finish({ cookie: started.cookie, state: started.state, code: fake.issueCode(), provider: 'google' });
        if(!res.redirectedTo.includes('oauth_error=state')) return fail(`landed on ${res.redirectedTo}`);
        pass('refused');
      } finally {
        await fake.close();
        await resetSettings();
        await purge();
      }
    },

    'declining at the provider sends the visitor back where they started, without a session': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await configureFake();
      const fake = await startFakeProvider();

      try {
        const started = leg(await begin({ mode: 'register', next: '/shop' }));
        const res = await finish({ cookie: started.cookie, state: started.state, error: 'access_denied' });

        if(res.redirectedTo !== '/register?oauth_error=denied&next=%2Fshop') return fail(`landed on ${res.redirectedTo}`);
        if(cookieNamed(res, 'session_token')) return fail('a session was issued');
        pass('back on /register with the code and next');
      } finally {
        await fake.close();
        await resetSettings();
        await purge();
      }
    },

    'an authorization code works once': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await configureFake();
      const fake = await startFakeProvider();

      try {
        const started = leg(await begin());
        fake.state.challenge = started.challenge;
        const code = fake.issueCode();

        const first = await finish({ cookie: started.cookie, state: started.state, code });
        if(first.redirectedTo !== '/account') return fail('the first use should succeed');

        const second = await finish({ cookie: started.cookie, state: started.state, code });
        if(!second.redirectedTo.includes('oauth_error=exchange') || cookieNamed(second, 'session_token')) return fail(`replay landed on ${second.redirectedTo}`);
        pass('replay refused');
      } finally {
        await fake.close();
        await resetSettings();
        await purge();
      }
    },

    'a PKCE verifier that does not belong to the challenge fails at the provider': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await configureFake();
      const fake = await startFakeProvider();

      try {
        const started = leg(await begin());
        fake.state.challenge = 'a-challenge-from-some-other-flow';
        const res = await finish({ cookie: started.cookie, state: started.state, code: fake.issueCode() });

        if(!res.redirectedTo.includes('oauth_error=exchange')) return fail(`landed on ${res.redirectedTo} — is the fake provider actually checking PKCE?`);
        pass('the provider’s PKCE check is real and reaches the failure path');
      } finally {
        await fake.close();
        await resetSettings();
        await purge();
      }
    },

    'an error hidden inside a 200 from the token endpoint is a failed sign-in': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await configureFake();
      const fake = await startFakeProvider();

      try {
        fake.state.tokenReply = { status: 200, body: { error: 'bad_verification_code' } };
        const res = await signInWith(fake);
        if(!res.redirectedTo.includes('oauth_error=exchange') || cookieNamed(res, 'session_token')) return fail(`landed on ${res.redirectedTo}`);
        pass('refused');
      } finally {
        await fake.close();
        await resetSettings();
        await purge();
      }
    },

    'a provider that is off, incomplete or unknown is never started': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      const fake = await startFakeProvider();

      try {
        let res = await begin();
        if(!res.redirectedTo.startsWith('/login?oauth_error=unavailable')) return fail(`unconfigured: ${res.redirectedTo}`);
        if(cookieNamed(res, 'kempo_oauth')) return fail('a flow cookie was set for a provider that is not available');

        await setSetting('kempo-oauth', 'fake_enabled', true, 'boolean', false, null);
        await setSetting('kempo-oauth', 'fake_client_id', 'only-an-id', 'string', false, null);
        res = await begin();
        if(!res.redirectedTo.includes('oauth_error=unavailable')) return fail(`id but no secret: ${res.redirectedTo}`);

        await configureFake({ enabled: false });
        res = await begin();
        if(!res.redirectedTo.includes('oauth_error=unavailable')) return fail(`switched off: ${res.redirectedTo}`);

        for(const name of ['nonesuch', '__proto__', '../x', '']){
          res = await begin({ provider: name });
          if(!res.redirectedTo.includes('oauth_error=unavailable')) return fail(`provider ${JSON.stringify(name)}: ${res.redirectedTo}`);
        }

        pass('all refused with the same code');
      } finally {
        await fake.close();
        await resetSettings();
        await purge();
      }
    },

    'switching a provider off mid-flight stops the callback': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await configureFake();
      const fake = await startFakeProvider();

      try {
        const started = leg(await begin());
        fake.state.challenge = started.challenge;
        await setSetting('kempo-oauth', 'fake_enabled', false, 'boolean', false, null);

        const res = await finish({ cookie: started.cookie, state: started.state, code: fake.issueCode() });
        if(!res.redirectedTo.includes('oauth_error=unavailable') || cookieNamed(res, 'session_token')) return fail(`landed on ${res.redirectedTo}`);
        pass('refused');
      } finally {
        await fake.close();
        await resetSettings();
        await purge();
      }
    },

    'a sign-in that cannot be allowed reports why, with a code and never a message': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await configureFake();
      const fake = await startFakeProvider();

      try {
        const existing = await makeUser('taken');
        const res = await signInWith(fake, { profile: { id: 'someone-else', email: existing.email, emailVerified: false, name: 'Impostor' } });

        if(res.redirectedTo !== '/login?oauth_error=email_in_use') return fail(`landed on ${res.redirectedTo}`);
        if(cookieNamed(res, 'session_token')) return fail('a session was issued');
        pass('email_in_use');
      } finally {
        await fake.close();
        await resetSettings();
        await purge();
      }
    },

    /*
      What a visitor is told
    */

    'the public provider list shows what is switched on and nothing about how': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await configureFake();
      await setSetting('kempo-oauth', 'google_enabled', true, 'boolean', false, null);
      await setSetting('kempo-oauth', 'google_client_id', 'google-id-only', 'string', false, null);
      const fake = await startFakeProvider();

      try {
        const res = fakeResponse();
        await listProvidersRoute(fakeRequest(), res);
        const names = res.body.providers.map(provider => provider.name);

        if(names.join() !== 'fake') return fail(`expected only the complete provider, got ${names}`);
        const text = JSON.stringify(res.body);
        for(const secret of [SECRET, 'fake-client-id', 'google-id-only']) if(text.includes(secret)) return fail(`the public list leaks ${secret}`);
        if(Object.keys(res.body.providers[0]).sort().join() !== 'icon,label,mono,name') return fail(`fields were ${Object.keys(res.body.providers[0])}`);
        pass('complete providers only, four fields each');
      } finally {
        await fake.close();
        await resetSettings();
        await purge();
      }
    },

    /*
      The admin side
    */

    'the settings and accounts routes are closed to anyone without the permission': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await dropGroups();

      try {
        const nobody = await adminWith([], 'nobody');
        const viewer = await adminWith(['oauth:view'], 'viewer');

        const cases = [
          ['settings GET', getSettingsRoute, 'GET'],
          ['settings PUT', putSettingsRoute, 'PUT'],
          ['accounts DELETE', disconnectRoute, 'DELETE'],
        ];

        for(const [label, route] of cases){
          let res = fakeResponse();
          await route(as(null, { params: { id: 'x' }, body: { global: { base_url: '' } } }), res);
          if(res.statusCode !== 401) return fail(`${label} without a session: ${res.statusCode}`);

          res = fakeResponse();
          await route(as(nobody.token, { params: { id: 'x' }, body: { global: { base_url: '' } } }), res);
          if(res.statusCode !== 403) return fail(`${label} without the permission: ${res.statusCode}`);

          res = fakeResponse();
          await route(as(viewer.token, { params: { id: 'x' }, body: { global: { base_url: '' } } }), res);
          if(res.statusCode !== 403) return fail(`${label} for a viewer: ${res.statusCode}`);
        }

        let res = fakeResponse();
        await accountsRoute(as(null), res);
        if(res.statusCode !== 401) return fail(`accounts GET without a session: ${res.statusCode}`);

        res = fakeResponse();
        await accountsRoute(as(nobody.token), res);
        if(res.statusCode !== 403) return fail(`accounts GET without the permission: ${res.statusCode}`);

        res = fakeResponse();
        await accountsRoute(as(viewer.token), res);
        if(res.statusCode !== 200 || !Array.isArray(res.body.accounts)) return fail(`accounts GET for a viewer: ${res.statusCode}`);

        pass('401 without a session, 403 without the permission, and view does not imply unlink or settings');
      } finally {
        await dropGroups();
        await resetSettings();
        await purge();
      }
    },

    'saving a provider stores the secret encrypted, keeps its description, and never returns it': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await dropGroups();

      try {
        const admin = await adminWith(['oauth:view', 'oauth:unlink', 'oauth:settings'], 'settings');

        let res = fakeResponse();
        await putSettingsRoute(as(admin.token, { body: { providers: { google: { enabled: true, client_id: '  the-google-id  ', client_secret: 'the-google-secret-value' } } } }), res);
        if(res.statusCode !== 200) return fail(`save: ${res.statusCode} ${JSON.stringify(res.body)}`);

        const google = res.body.providers.find(provider => provider.name === 'google');
        if(!google.active || google.clientId !== 'the-google-id' || !google.hasSecret) return fail(`after save: ${JSON.stringify(google)}`);
        if(JSON.stringify(res.body).includes('the-google-secret-value')) return fail('the save response contains the secret');

        const [row] = await db.select().from(schema.setting).where(eq(schema.setting.name, 'kempo-oauth:google_client_secret'));
        if(row.type !== 'secret') return fail(`stored as type ${row.type}`);
        if(row.value.includes('the-google-secret-value')) return fail('the secret is stored in plain text');
        if(!row.description) return fail('the setting’s description was erased');

        res = fakeResponse();
        await getSettingsRoute(as(admin.token), res);
        if(JSON.stringify(res.body).includes('the-google-secret-value')) return fail('GET returns the secret');
        if(res.body.providers.find(provider => provider.name === 'google').redirectUri !== 'http://localhost:9876/oauth/api/callback/google') return fail('wrong redirect URI shown');

        pass('encrypted at rest, described, absent from both responses');
      } finally {
        await dropGroups();
        await resetSettings();
        await purge();
      }
    },

    'a blank secret leaves the stored one alone, and only an explicit null removes it': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await dropGroups();

      try {
        const admin = await adminWith(['oauth:settings'], 'blank');
        const save = async body => {
          const res = fakeResponse();
          await putSettingsRoute(as(admin.token, { body }), res);
          return res;
        };

        await save({ providers: { google: { enabled: true, client_id: 'id-1', client_secret: 'secret-1' } } });

        let res = await save({ providers: { google: { client_id: 'id-2', client_secret: '' } } });
        let google = res.body.providers.find(provider => provider.name === 'google');
        if(!google.hasSecret || google.clientId !== 'id-2') return fail(`a blank secret wiped the stored one: ${JSON.stringify(google)}`);

        res = await save({ providers: { google: { client_secret: '   ' } } });
        if(res.statusCode !== 400) return fail(`a whitespace-only secret should be "nothing to save", got ${res.statusCode}`);

        res = await save({ providers: { google: { client_secret: null } } });
        google = res.body.providers.find(provider => provider.name === 'google');
        if(google.hasSecret || google.active) return fail(`null did not clear it: ${JSON.stringify(google)}`);

        pass('blank keeps, null clears');
      } finally {
        await dropGroups();
        await resetSettings();
        await purge();
      }
    },

    'settings that could be turned against the site are refused': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await dropGroups();

      try {
        const admin = await adminWith(['oauth:settings'], 'validate');
        const attempt = async body => {
          const res = fakeResponse();
          await putSettingsRoute(as(admin.token, { body }), res);
          return res;
        };

        const bad = [
          ['a base_url that is not a URL', { global: { base_url: 'not a url' } }],
          ['a javascript: base_url', { global: { base_url: 'javascript:alert(1)' } }],
          ['a base_url with a query', { global: { base_url: 'https://example.com/?x=1' } }],
          ['an off-site after_login_path', { global: { after_login_path: 'https://evil.example' } }],
          ['a scheme-relative after_login_path', { global: { after_login_path: '//evil.example' } }],
          ['a non-boolean link_verified_emails', { global: { link_verified_emails: 'yes' } }],
          ['a privacy contact that is not an email', { global: { privacy_contact_email: 'not an email' } }],
          ['a javascript: privacy policy address', { global: { privacy_policy_url: 'javascript:alert(1)' } }],
          ['a privacy policy address with a password in it', { global: { privacy_policy_url: 'https://user:secret@example.com/privacy' } }],
          ['a privacy policy address that is not a URL', { global: { privacy_policy_url: 'privacy' } }],
          ['an over-long privacy operator', { global: { privacy_operator: 'x'.repeat(300) } }],
          ['a non-boolean enabled', { providers: { google: { enabled: 'true' } } }],
          ['a tenant that would change the URL path', { providers: { microsoft: { tenant: '../evil' } } }],
          ['a provider entry that is not an object', { providers: { google: 'enabled' } }],
        ];

        for(const [label, body] of bad){
          const res = await attempt(body);
          if(res.statusCode !== 400) return fail(`${label} was accepted (${res.statusCode})`);
        }

        const good = await attempt({ global: { base_url: 'https://example.com///' } });
        if(good.body.global.baseUrl !== 'https://example.com') return fail(`base_url stored as ${good.body.global.baseUrl}`);

        const privacy = await attempt({ global: { privacy_operator: '  Example Ltd  ', privacy_contact_email: ' privacy@example.com ', privacy_policy_url: 'https://example.com/privacy' } });
        if(privacy.statusCode !== 200 || privacy.body.global.privacyOperator !== 'Example Ltd' || privacy.body.global.privacyContactEmail !== 'privacy@example.com') return fail(`privacy settings: ${privacy.statusCode} ${JSON.stringify(privacy.body?.global)}`);
        if(privacy.body.privacyUrl !== 'https://example.com/privacy' || privacy.body.providers[0].links[0].url !== 'https://example.com/privacy') return fail('the address given to providers is not the site’s own policy');

        const unknown = await attempt({ providers: { nonesuch: { enabled: true } }, global: {} });
        if(unknown.statusCode !== 400) return fail('an unknown provider alone should be "nothing to save"');

        const rows = await db.select().from(schema.setting).where(like(schema.setting.name, 'kempo-oauth:nonesuch%'));
        if(rows.length) return fail('a setting was written for a provider that does not exist');

        pass(`${bad.length} bad inputs refused; a trailing slash is trimmed; unknown providers write nothing`);
      } finally {
        await dropGroups();
        await resetSettings();
        await purge();
      }
    },

    'a connected account can be disconnected, and the user keeps their account': async ({ pass, fail }) => {
      await purge();
      await resetSettings();
      await configureFake();
      await dropGroups();
      const fake = await startFakeProvider();

      try {
        await signInWith(fake, { profile: { id: 'to-disconnect', email: 'oauthtest-disconnect@example.com', emailVerified: true, name: 'D C' } });
        const admin = await adminWith(['oauth:view', 'oauth:unlink'], 'unlink');

        let res = fakeResponse();
        await accountsRoute(as(admin.token), res);
        const row = res.body.accounts.find(account => account.providerUserId === 'to-disconnect');
        if(!row) return fail('the connected account is not listed');

        res = fakeResponse();
        await disconnectRoute(as(admin.token, { params: { id: row.id } }), res);
        if(res.statusCode !== 200) return fail(`disconnect: ${res.statusCode}`);

        const [stillThere] = await db.select().from(schema.user).where(eq(schema.user.email, 'oauthtest-disconnect@example.com'));
        if(!stillThere) return fail('disconnecting deleted the user');
        const links = await db.select().from(kempoOauthAccount).where(eq(kempoOauthAccount.providerUserId, 'to-disconnect'));
        if(links.length) return fail('the link is still there');

        res = fakeResponse();
        await disconnectRoute(as(admin.token, { params: { id: row.id } }), res);
        if(res.statusCode !== 404) return fail('disconnecting twice should be a 404');

        pass('link gone, user intact');
      } finally {
        await fake.close();
        await dropGroups();
        await resetSettings();
        await purge();
      }
    },
  };
