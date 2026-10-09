import { fetchProfile } from '../server/utils/flow/exchange.js';
import { listProviders } from '../server/providers/index.js';

/*
  What each provider turns its own reply into.

  Every reply below is a literal in the shape the provider documents. The point is the mapping and,
  above all, the `emailVerified` flag, which decides whether a sign-in may attach to an account that
  already exists: a provider that reports an address and a provider that has *checked* it are not
  the same, and getting one wrong is an account takeover.
*/

const provider = name => listProviders().find(entry => entry.name === name);

// Answers each URL from a table, or with an error when the table has nothing for it.
const httpFor = table => ({
  getJson: async url => {
    // Longest match wins, so `/user/emails` is not answered by the fixture for `/user`.
    const key = Object.keys(table).filter(prefix => url.startsWith(prefix)).sort((a, b) => b.length - a.length)[0];
    if(!key) return [{ code: 502, msg: 'rejected', detail: `no fixture for ${url}` }, null];
    return table[key] instanceof Error ? [{ code: 502, msg: 'rejected' }, null] : [null, table[key]];
  },
});

const profileOf = async (name, table) => fetchProfile({ provider: provider(name), tokenResponse: { access_token: 'tok' }, http: httpFor(table) });

export default {
  'Google: a confirmed address is verified, an unconfirmed one is not': async ({ pass, fail }) => {
    const url = 'https://openidconnect.googleapis.com/v1/userinfo';

    const [, confirmed] = await profileOf('google', { [url]: { sub: '123', email: 'Person@Example.com', email_verified: true, name: 'A Person', picture: 'https://p/1.png' } });
    if(confirmed.id !== '123' || confirmed.email !== 'person@example.com' || !confirmed.emailVerified) return fail(`confirmed: ${JSON.stringify(confirmed)}`);
    if(confirmed.name !== 'A Person' || confirmed.avatarUrl !== 'https://p/1.png') return fail('name or avatar missing');

    for(const flag of [false, undefined, 'true', 1]){
      const [, other] = await profileOf('google', { [url]: { sub: '123', email: 'a@b.com', email_verified: flag } });
      if(other.emailVerified) return fail(`email_verified ${JSON.stringify(flag)} was treated as verified`);
    }
    pass('only the literal boolean true counts');
  },

  'Google: a reply with no subject is an error, not a user called undefined': async ({ pass, fail }) => {
    const [error] = await profileOf('google', { 'https://openidconnect.googleapis.com/v1/userinfo': { email: 'a@b.com' } });
    if(!error) return fail('accepted a profile with no id');
    pass('refused');
  },

  'GitHub: the email is the primary verified one, and never an unverified one': async ({ pass, fail }) => {
    const base = { 'https://api.github.com/user': { id: 4242, login: 'octo', name: null, avatar_url: 'https://a/1' } };

    const [, primary] = await profileOf('github', { ...base, 'https://api.github.com/user/emails': [
      { email: 'old@example.com', primary: false, verified: true },
      { email: 'main@example.com', primary: true, verified: true },
      { email: 'unconfirmed@example.com', primary: false, verified: false },
    ] });
    if(primary.email !== 'main@example.com' || !primary.emailVerified) return fail(`primary: ${JSON.stringify(primary)}`);
    if(primary.id !== '4242' || primary.name !== 'octo') return fail('id should be a string and name should fall back to the login');

    const [, onlyUnverified] = await profileOf('github', { ...base, 'https://api.github.com/user/emails': [{ email: 'x@example.com', primary: true, verified: false }] });
    if(onlyUnverified.email !== null || onlyUnverified.emailVerified) return fail('used an unverified address');

    const [, noScope] = await profileOf('github', { ...base, 'https://api.github.com/user/emails': new Error('404') });
    if(noScope.email !== null) return fail('a failed email lookup should mean no email, not a failed sign-in');
    pass('verified only; failure degrades to no email');
  },

  'Facebook: an address is reported but never trusted': async ({ pass, fail }) => {
    const [, profile] = await profileOf('facebook', { 'https://graph.facebook.com/': { id: '9', name: 'F B', email: 'fb@example.com', picture: { data: { url: 'https://p/9' } } } });
    if(profile.email !== 'fb@example.com') return fail('email dropped');
    if(profile.emailVerified) return fail('Facebook never says an address was confirmed, so it must not be treated as verified');
    if(profile.avatarUrl !== 'https://p/9') return fail('avatar missing');
    pass('email kept, verified false');
  },

  'X: no email, and the username stands in when there is no name': async ({ pass, fail }) => {
    const url = 'https://api.x.com/2/users/me';

    const [, full] = await profileOf('x', { [url]: { data: { id: '77', name: 'Ex User', username: 'exuser', profile_image_url: 'https://p/77' } } });
    if(full.email !== null || full.emailVerified) return fail('X cannot share an email');
    if(full.name !== 'Ex User' || full.id !== '77') return fail(`got ${JSON.stringify(full)}`);

    const [, nameless] = await profileOf('x', { [url]: { data: { id: '78', username: 'handle' } } });
    if(nameless.name !== 'handle') return fail('should fall back to the username');
    pass('mapped');
  },

  'Microsoft: an address is reported but never trusted': async ({ pass, fail }) => {
    const [, profile] = await profileOf('microsoft', { 'https://graph.microsoft.com/oidc/userinfo': { sub: 'abc', name: 'M S', email: 'ms@example.com' } });
    if(profile.emailVerified) return fail('a Microsoft directory can hold any address, so it must not be treated as verified');
    if(profile.id !== 'abc') return fail('sub is the id');
    pass('email kept, verified false');
  },

  'a provider that fails to answer is an error': async ({ pass, fail }) => {
    for(const { name } of listProviders()){
      const [error, profile] = await profileOf(name, {});
      if(!error || profile) return fail(`${name} produced a profile from nothing`);
    }
    pass('every provider fails closed');
  },

  'a profile with a malformed email is treated as having none': async ({ pass, fail }) => {
    const [, profile] = await profileOf('google', { 'https://openidconnect.googleapis.com/v1/userinfo': { sub: '1', email: 'not-an-email', email_verified: true } });
    if(profile.email !== null) return fail(`kept ${profile.email}`);
    pass('dropped');
  },
};
