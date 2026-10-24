import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db, deleteSetting, schema, setSetting } from 'kempo/server/sdk.js';
import { kempoOauthAccount, kempoOauthDeletion } from '../server/db/schema.js';
import signedRequest from '../server/utils/deletion/signedRequest.js';
import erase from '../server/utils/deletion/erase.js';
import status from '../server/utils/deletion/status.js';
import describe from '../server/utils/config/describe.js';
import deletionRoute from '../public/api/data-deletion/[provider]/POST.js';
import statusRoute from '../public/api/data-deletion-status/GET.js';
import privacyRoute from '../public/api/privacy/GET.js';
import { databaseReachable, encryptionAvailable, skipReason } from './testDatabase.js';
import { createAccount } from '../server/utils/accounts/store.js';
import { fakeRequest, fakeResponse, makeUser, purge } from './helpers.js';

/*
  Data deletion: the signed request a provider sends when a person removes the app, what is deleted
  because of it, and the pages that tell the person what happened. The provider is Facebook, because
  it is the one that asks for a callback; the signature is made the way Facebook makes it.
*/

const SECRET = 'a-facebook-app-secret';

const base64url = buffer => Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const signed = (data, secret = SECRET) => {
  const payload = base64url(JSON.stringify(data));
  return `${base64url(crypto.createHmac('sha256', secret).update(payload).digest())}.${payload}`;
};

/* kempo works out what a user may do from the group everybody is in; a fresh test database may not have it yet. */
const ensureUsersGroup = () => db.insert(schema.group).values({ name: 'system:Users', description: 'Default group for all users', owner: 'system', createdAt: new Date() }).onConflictDoNothing();

const request = userId => signed({ algorithm: 'HMAC-SHA256', issued_at: 1700000000, user_id: userId });

export default {
  'a request is accepted only when its signature is Facebook’s, and says whose data it is': async ({ pass, fail }) => {
    const [ok, who] = signedRequest(request('1234'), SECRET);
    if(ok || who.userId !== '1234') return fail(`a good request: ${JSON.stringify(ok)} ${JSON.stringify(who)}`);

    const [wrongSecret] = signedRequest(request('1234'), 'somebody-elses-secret');
    if(wrongSecret?.code !== 401) return fail(`signed with another secret: ${JSON.stringify(wrongSecret)}`);

    const [good, payload] = request('1234').split('.');
    const forged = `${good}.${base64url(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '9999' }))}`;
    const [tampered] = signedRequest(forged, SECRET);
    if(tampered?.code !== 401) return fail(`a payload swapped under a real signature: ${JSON.stringify(tampered)}`);

    for(const [label, value] of [['nothing', ''], ['no payload', 'abc'], ['three parts', 'a.b.c'], ['not a string', null]]){
      const [error] = signedRequest(value, SECRET);
      if(error?.code !== 400) return fail(`${label}: ${JSON.stringify(error)}`);
    }

    const [noSecret] = signedRequest(request('1234'), '');
    if(noSecret?.code !== 400) return fail('a request was checked against no secret');

    const [algorithm] = signedRequest(signed({ algorithm: 'plaintext', user_id: '1' }), SECRET);
    if(algorithm?.code !== 400) return fail(`another algorithm: ${JSON.stringify(algorithm)}`);

    const [noUser] = signedRequest(signed({ algorithm: 'HMAC-SHA256' }), SECRET);
    if(noUser?.code !== 400) return fail(`a request about nobody: ${JSON.stringify(noUser)}`);
    pass(payload ? 'checked' : '');
  },

  'the privacy and deletion addresses are the ones to give each provider': async ({ pass, fail }) => {
    if(!databaseReachable) return pass(`skipped: ${skipReason}`);

    const described = await describe('https://example.com');
    const links = name => described.providers.find(provider => provider.name === name).links;
    const facebook = links('facebook');

    if(facebook.map(link => link.key).join() !== 'privacy,deletion') return fail(`facebook: ${facebook.map(link => link.key)}`);
    if(facebook[0].url !== 'https://example.com/privacy/') return fail(`privacy url: ${facebook[0].url}`);
    if(facebook[1].url !== 'https://example.com/oauth/api/data-deletion/facebook') return fail(`callback url: ${facebook[1].url}`);
    if(links('google').map(link => link.key).join() !== 'privacy') return fail('google should have a privacy field only');
    if(links('microsoft').map(link => link.key).join() !== 'privacy') return fail('microsoft should have a privacy field only');
    if(links('github').length || links('x').length) return fail('github and x have no privacy field, so nothing should be offered');
    pass('');
  },

  ...(databaseReachable && encryptionAvailable ? {
    'removing the app deletes the person, their sign-in links and sessions, and says so under a code': async ({ pass, fail }) => {
      await purge();
      await ensureUsersGroup();
      await db.delete(kempoOauthDeletion);
      const person = await makeUser('deleted');
      const other = await makeUser('other');
      await createAccount({ provider: 'facebook', providerUserId: 'fb-100', userId: person.id, email: person.email, name: person.name });
      await createAccount({ provider: 'google', providerUserId: 'g-100', userId: person.id, email: person.email, name: person.name });
      await createAccount({ provider: 'facebook', providerUserId: 'fb-200', userId: other.id, email: other.email, name: other.name });

      const [error, result] = await erase({ provider: 'facebook', providerUserId: 'fb-100' });
      if(error || result.status !== 'deleted' || !/^[a-f0-9]{32}$/.test(result.code)) return fail(JSON.stringify(error || result));

      const users = await db.select().from(schema.user).where(eq(schema.user.id, person.id));
      const links = await db.select().from(kempoOauthAccount).where(eq(kempoOauthAccount.userId, person.id));
      if(users.length || links.length) return fail(`left behind: ${users.length} users, ${links.length} links`);

      const kept = await db.select().from(schema.user).where(eq(schema.user.id, other.id));
      const keptLinks = await db.select().from(kempoOauthAccount).where(eq(kempoOauthAccount.userId, other.id));
      if(!kept.length || !keptLinks.length) return fail('someone else was deleted too');

      const [row] = await db.select().from(kempoOauthDeletion).where(eq(kempoOauthDeletion.code, result.code));
      if(row?.status !== 'deleted' || JSON.stringify(row).includes('fb-100') || JSON.stringify(row).includes(person.email)) return fail(`the record: ${JSON.stringify(row)}`);

      const [again, second] = await erase({ provider: 'facebook', providerUserId: 'fb-100' });
      if(again || second.status !== 'nothing' || second.code === result.code) return fail(`asking again: ${JSON.stringify(again || second)}`);
      await purge();
      pass('');
    },

    'an administrator keeps their account: only the link with the provider goes': async ({ pass, fail }) => {
      try {
        await purge();
        await ensureUsersGroup();
        const admin = await makeUser('admin');
        await createAccount({ provider: 'facebook', providerUserId: 'fb-300', userId: admin.id, email: admin.email, name: admin.name });

        // kempo treats membership of this group as holding every permission, which is how an administrator is recognised.
        const now = new Date();
        await db.insert(schema.group).values({ name: 'system:Administrators', description: 'Full system access', owner: 'system', createdAt: now }).onConflictDoNothing();
        await db.insert(schema.userGroup).values({ id: crypto.randomUUID(), userId: admin.id, groupName: 'system:Administrators', createdAt: now });

        const [error, result] = await erase({ provider: 'facebook', providerUserId: 'fb-300' });
        const stillThere = await db.select().from(schema.user).where(eq(schema.user.id, admin.id));
        const links = await db.select().from(kempoOauthAccount).where(eq(kempoOauthAccount.userId, admin.id));

        await purge();

        if(error || result.status !== 'unlinked') return fail(JSON.stringify(error || result));
        if(!stillThere.length) return fail('an administrator account was deleted');
        if(links.length) return fail('the provider link was kept');
        pass('');
      } catch(error) {
        return fail(String(error.stack || error).split('\n').slice(0, 4).join(' | '));
      }
    },

    'the callback route verifies the request, deletes, and answers with the url and code Facebook expects': async ({ pass, fail }) => {
      await purge();
      await ensureUsersGroup();
      await db.delete(kempoOauthDeletion);
      await setSetting('kempo-oauth', 'facebook_client_id', 'fb-app', 'string', false, null);
      await setSetting('kempo-oauth', 'facebook_client_secret', SECRET, 'secret', false, null);
      const person = await makeUser('callback');
      await createAccount({ provider: 'facebook', providerUserId: 'fb-400', userId: person.id, email: person.email, name: person.name });

      try {
        const forged = fakeResponse();
        await deletionRoute(fakeRequest({ params: { provider: 'facebook' }, body: { signed_request: signed({ algorithm: 'HMAC-SHA256', user_id: 'fb-400' }, 'not-the-secret') } }), forged);
        if(forged.statusCode !== 401 || !(await db.select().from(schema.user).where(eq(schema.user.id, person.id))).length) return fail(`a forged request: ${forged.statusCode}`);

        const res = fakeResponse();
        await deletionRoute(fakeRequest({ params: { provider: 'facebook' }, body: { signed_request: request('fb-400') }, headers: { host: 'kempo.test' } }), res);
        if(res.statusCode !== 200 || !res.body?.confirmation_code) return fail(`the callback: ${res.statusCode} ${JSON.stringify(res.body)}`);
        if(res.body.url !== `http://kempo.test/data-deletion/?code=${res.body.confirmation_code}`) return fail(`the url: ${res.body.url}`);
        if((await db.select().from(schema.user).where(eq(schema.user.id, person.id))).length) return fail('the person was not deleted');

        const asked = fakeResponse();
        await statusRoute(fakeRequest({ query: { code: res.body.confirmation_code } }), asked);
        if(asked.statusCode !== 200 || asked.body.status !== 'deleted' || JSON.stringify(asked.body).includes('fb-400')) return fail(`the status: ${JSON.stringify(asked.body)}`);

        const unknown = fakeResponse();
        await statusRoute(fakeRequest({ query: { code: 'f'.repeat(32) } }), unknown);
        const nonsense = fakeResponse();
        await statusRoute(fakeRequest({ query: { code: '<script>' } }), nonsense);
        if(unknown.statusCode !== 404 || nonsense.statusCode !== 400) return fail(`unknown ${unknown.statusCode}, nonsense ${nonsense.statusCode}`);

        const noCallback = fakeResponse();
        await deletionRoute(fakeRequest({ params: { provider: 'google' }, body: { signed_request: request('1') } }), noCallback);
        if(noCallback.statusCode !== 404) return fail(`a provider with no callback: ${noCallback.statusCode}`);
        pass('');
      } finally {
        await deleteSetting('kempo-oauth', 'facebook_client_id');
        await deleteSetting('kempo-oauth', 'facebook_client_secret');
        await purge();
      }
    },

    'a provider with no secret saved cannot be asked to delete anything': async ({ pass, fail }) => {
      await deleteSetting('kempo-oauth', 'facebook_client_secret');
      const res = fakeResponse();
      await deletionRoute(fakeRequest({ params: { provider: 'facebook' }, body: { signed_request: request('1') } }), res);
      if(res.statusCode !== 404) return fail(`${res.statusCode}`);
      pass('');
    },

    'the privacy policy is filled in with the site, who runs it and the providers that are on': async ({ pass, fail }) => {
      await setSetting('kempo-oauth', 'privacy_operator', 'Example Ltd', 'string', false, null);
      await setSetting('kempo-oauth', 'privacy_contact_email', 'privacy@example.com', 'string', false, null);
      await setSetting('kempo-oauth', 'facebook_enabled', true, 'boolean', false, null);
      await setSetting('kempo-oauth', 'facebook_client_id', 'fb-app', 'string', false, null);
      await setSetting('kempo-oauth', 'facebook_client_secret', SECRET, 'secret', false, null);

      try {
        const res = fakeResponse();
        await privacyRoute(fakeRequest(), res);
        const names = res.body.providers.map(provider => provider.name);
        if(res.body.operator !== 'Example Ltd' || res.body.contactEmail !== 'privacy@example.com') return fail(JSON.stringify(res.body));
        if(names.join() !== 'facebook' || !res.body.providers[0].deletesAutomatically) return fail(`providers: ${names}`);
        if(!res.body.siteName) return fail('no site name');
        pass('');
      } finally {
        for(const name of ['privacy_operator', 'privacy_contact_email', 'facebook_enabled', 'facebook_client_id', 'facebook_client_secret']) await deleteSetting('kempo-oauth', name);
      }
    },
  } : {
    'data deletion against a database (SKIPPED)': async ({ pass }) => pass(`skipped: ${!databaseReachable ? skipReason : 'SETTINGS_ENCRYPTION_KEY is not set'}`),
  }),
};
