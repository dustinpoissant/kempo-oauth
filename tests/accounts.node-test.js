import { eq } from 'drizzle-orm';
import { db, getSession, loginEmail, schema } from 'kempo/server/sdk.js';
import { kempoOauthAccount } from '../server/db/schema.js';
import signIn from '../server/utils/accounts/signIn.js';
import { deleteAccountById, findAccount, listAccounts } from '../server/utils/accounts/store.js';
import { setSetting, deleteSetting } from 'kempo/server/sdk.js';
import install from '../install.js';
import { databaseReachable, skipReason } from './testDatabase.js';
import { EMAIL_PREFIX, makeUser, purge, withSystemSetting } from './helpers.js';

/*
  Signing in, against a real database.

  This is the function where a mistake is a security hole rather than a bug, so the cases below are
  mostly the ways it could be talked into doing the wrong thing: an address a provider merely
  *reports*, an account somebody registered for an address that is not theirs, a link left behind by
  a user who has since been deleted.

  No provider is involved. Every profile is a literal, because the point is what this extension does
  with one.
*/

const skipped = reason => ({
  'accounts (SKIPPED)': async ({ pass }) => pass(`skipped: ${reason}`),
});

const google = { name: 'google', label: 'Google' };
const x = { name: 'x', label: 'X' };

let counter = 0;
const profile = (overrides = {}) => ({
  id: `g-${Date.now()}-${counter++}`,
  email: `${EMAIL_PREFIX}new-${Date.now()}-${counter}@example.com`,
  emailVerified: true,
  name: 'New Person',
  avatarUrl: null,
  ...overrides,
});

const userByEmail = async email => (await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1))[0];

/*
  The table comes from `drizzle-kit push`, which makes the indexes the schema declares — and this
  schema declares none, on purpose, because kempo's installer would not carry them across. In
  production the unique index exists because install.js creates it, so the suite does the same
  rather than testing a database no site will ever have.
*/
if(databaseReachable) await install();

export default !databaseReachable ? skipped(`${skipReason} — point DATABASE_URL at a *_test database and run drizzle-kit push`) : {
  'a first sign-in creates a user, links the identity and starts a session': async ({ pass, fail }) => {
    await purge();
    const p = profile();

    const [error, result] = await signIn({ provider: google, profile: p });
    if(error) return fail(`${error.code} ${error.msg}`);
    if(!result.isNew || !result.sessionToken) return fail(`expected a new user with a session, got ${JSON.stringify(result)}`);

    const user = await userByEmail(p.email);
    if(!user || user.name !== 'New Person' || !user.emailVerified) return fail(`user row was ${JSON.stringify(user)}`);

    const [sessionError, session] = await getSession({ token: result.sessionToken });
    if(sessionError || session.user.id !== user.id) return fail('the session does not belong to the new user');

    const link = await findAccount('google', p.id);
    if(link?.userId !== user.id) return fail('no link was recorded');

    await purge();
    pass('user, link and session all agree');
  },

  'a second sign-in is the same user, not a new one': async ({ pass, fail }) => {
    await purge();
    const p = profile();

    const [, first] = await signIn({ provider: google, profile: p });
    const [error, second] = await signIn({ provider: google, profile: { ...p, name: 'Renamed' } });
    if(error) return fail(error.msg);

    if(second.isNew || second.user.id !== first.user.id) return fail('a different user came back');
    const rows = await db.select().from(kempoOauthAccount).where(eq(kempoOauthAccount.provider, 'google'));
    if(rows.length !== 1) return fail(`${rows.length} link rows for one identity`);
    if(rows[0].name !== 'Renamed') return fail('the snapshot of the provider’s name was not refreshed');

    await purge();
    pass('one user, one link, snapshot refreshed');
  },

  'the new account’s password is not one anybody knows': async ({ pass, fail }) => {
    await purge();
    const p = profile();
    await signIn({ provider: google, profile: p });

    for(const guess of ['password', 'Password1!', p.email, p.id, '']){
      const [error] = await loginEmail(p.email, guess);
      if(!error) return fail(`signed in by password with ${JSON.stringify(guess)}`);
    }

    await purge();
    pass('no guess works');
  },

  'a verified provider email is connected to the existing account with that address': async ({ pass, fail }) => {
    await purge();
    const existing = await makeUser('existing');

    const [error, result] = await signIn({ provider: google, profile: profile({ email: existing.email.toUpperCase() }) });
    if(error) return fail(error.msg);

    if(result.isNew || result.user.id !== existing.id) return fail('signed in as somebody else');
    const [{ total }] = (await db.select().from(schema.user).where(eq(schema.user.id, existing.id))).map(() => ({ total: 1 }));
    if(total !== 1) return fail('duplicate user');

    // And the password still works: connecting a provider takes nothing away from a verified account.
    const [passwordError] = await loginEmail(existing.email, existing.password);
    if(passwordError) return fail(`the existing password stopped working: ${passwordError.msg}`);

    await purge();
    pass('same user, password intact (matched case-insensitively)');
  },

  'an address the provider did not confirm is never connected to an existing account': async ({ pass, fail }) => {
    await purge();
    const victim = await makeUser('victim');

    const [error, result] = await signIn({ provider: google, profile: profile({ email: victim.email, emailVerified: false }) });
    if(result) return fail(`signed in as ${result.user.id}`);
    if(error.code !== 409 || error.reason !== 'email_in_use') return fail(`expected email_in_use, got ${JSON.stringify(error)}`);

    const links = await db.select().from(kempoOauthAccount);
    if(links.length) return fail('a link was created anyway');

    await purge();
    pass('refused, nothing written');
  },

  'link_verified_emails off turns every provider sign-in into its own account': async ({ pass, fail }) => {
    await purge();
    const existing = await makeUser('optout');
    await setSetting('kempo-oauth', 'link_verified_emails', false, 'boolean', false, null);

    try {
      const [error] = await signIn({ provider: google, profile: profile({ email: existing.email }) });
      if(error?.reason !== 'email_in_use') return fail(`expected email_in_use, got ${JSON.stringify(error)}`);
    } finally {
      await deleteSetting('kempo-oauth', 'link_verified_emails');
    }

    await purge();
    pass('the setting is honoured');
  },

  'pre-hijacking: a verified sign-in onto an unverified account locks out the password and ends its sessions': async ({ pass, fail }) => {
    await purge();
    // Somebody registered the victim's address with a password they chose and never verified it.
    const squatted = await makeUser('squatted', { emailVerified: false, password: 'attackers-chosen-password' });
    const [, attackerSession] = await loginEmail(squatted.email, squatted.password).then(([e, r]) => [e, r]);

    const [error, result] = await signIn({ provider: google, profile: profile({ email: squatted.email, emailVerified: true }) });
    if(error) return fail(error.msg);
    if(result.user.id !== squatted.id) return fail('should have connected to the existing account');

    const [passwordError] = await loginEmail(squatted.email, squatted.password);
    if(!passwordError) return fail('the attacker’s password still works');

    if(attackerSession){
      const [staleError] = await getSession({ token: attackerSession.sessionToken });
      if(!staleError) return fail('the attacker’s existing session survived');
    }

    const row = await userByEmail(squatted.email);
    if(!row.emailVerified) return fail('the address should now be marked verified');

    await purge();
    pass('password dead, session gone, address verified');
  },

  'an address nobody has creates an account even when the provider is not sure of it': async ({ pass, fail }) => {
    await purge();
    const p = profile({ emailVerified: false });

    const [error, result] = await signIn({ provider: google, profile: p });
    if(error) return fail(error.msg);

    const user = await userByEmail(p.email);
    if(user.emailVerified) return fail('an unconfirmed address was recorded as verified');
    if(!result.sessionToken) return fail('no session, and this site does not require verified emails');

    await purge();
    pass('account created, address left unverified');
  },

  'registration closed refuses a new account but still lets a returning one in': async ({ pass, fail }) => {
    await purge();
    const returning = profile();
    await signIn({ provider: google, profile: returning });

    await withSystemSetting('allow_registration', false, 'boolean', async () => {
      const [error] = await signIn({ provider: google, profile: profile() });
      if(error?.reason !== 'registration_closed') return fail(`new account: expected registration_closed, got ${JSON.stringify(error)}`);

      const [returningError, result] = await signIn({ provider: google, profile: returning });
      if(returningError || result.isNew) return fail('a returning user was turned away');
      pass('new refused, returning admitted');
    });

    await purge();
  },

  'a site that requires verified emails does not hand out a session for an unverified one': async ({ pass, fail }) => {
    await purge();

    await withSystemSetting('require_email_verification', true, 'boolean', async () => {
      const unverified = profile({ emailVerified: false });
      const [error, result] = await signIn({ provider: google, profile: unverified });

      // The verification email goes through Resend; with no key configured that step may fail. What
      // must hold either way is that no session exists.
      if(result?.sessionToken) return fail('issued a session for an unverified address');
      if(result && !result.requiresVerification) return fail(`unexpected result ${JSON.stringify(result)}`);

      const [, verified] = await signIn({ provider: google, profile: profile({ emailVerified: true }) });
      if(!verified?.sessionToken) return fail(`a provider-verified address should get a session: ${JSON.stringify(error)}`);

      pass('unverified: no session; verified: session');
    });

    await purge();
  },

  'a provider that shares no email gets a placeholder address, or is refused where verification is required': async ({ pass, fail }) => {
    await purge();
    const p = profile({ email: null, emailVerified: false, id: `x-${Date.now()}` });

    const [error, result] = await signIn({ provider: x, profile: p });
    if(error) return fail(error.msg);
    if(!result.user.email.endsWith('@oauth.invalid')) return fail(`placeholder was ${result.user.email}`);
    if(result.user.emailVerified) return fail('a placeholder address cannot be verified');

    await withSystemSetting('require_email_verification', true, 'boolean', async () => {
      const [refused] = await signIn({ provider: x, profile: profile({ email: null, emailVerified: false, id: `x2-${Date.now()}` }) });
      if(refused?.reason !== 'no_email') return fail(`expected no_email, got ${JSON.stringify(refused)}`);
    });

    await purge();
    pass('placeholder normally; refused when verification is required');
  },

  'a link left behind by a deleted user is replaced, not trusted': async ({ pass, fail }) => {
    await purge();
    const p = profile();
    const [, first] = await signIn({ provider: google, profile: p });

    // What kempo's own deleteUser does: the user goes, this extension's row does not.
    await db.delete(schema.session).where(eq(schema.session.userId, first.user.id));
    await db.delete(schema.user).where(eq(schema.user.id, first.user.id));

    const [error, second] = await signIn({ provider: google, profile: p });
    if(error) return fail(error.msg);
    if(!second.isNew || second.user.id === first.user.id) return fail('signed in as the deleted user');

    const rows = await db.select().from(kempoOauthAccount).where(eq(kempoOauthAccount.providerUserId, p.id));
    if(rows.length !== 1 || rows[0].userId !== second.user.id) return fail('the stale link is still there');

    await purge();
    pass('stale link dropped, fresh account made');
  },

  'the database refuses two links for one provider identity': async ({ pass, fail }) => {
    await purge();
    const p = profile();
    const user = await makeUser('dup');
    const row = { provider: 'google', providerUserId: p.id, userId: user.id, createdAt: new Date(), lastLoginAt: new Date() };

    await db.insert(kempoOauthAccount).values({ id: 'a1', ...row });
    const rejected = await db.insert(kempoOauthAccount).values({ id: 'a2', ...row }).then(() => false, () => true);
    if(!rejected) return fail('a second row for the same identity was accepted — is the unique index missing? (install.js creates it)');

    await purge();
    pass('unique index holds');
  },

  'connected accounts can be listed, filtered, paged and disconnected': async ({ pass, fail }) => {
    await purge();
    await signIn({ provider: google, profile: profile() });
    await signIn({ provider: google, profile: profile() });
    const [, other] = await signIn({ provider: x, profile: profile({ email: null, emailVerified: false }) });

    const [, all] = await listAccounts({});
    if(all.total !== 3 || all.accounts.length !== 3) return fail(`expected 3, got ${all.total}`);

    const [, onlyX] = await listAccounts({ provider: 'x' });
    if(onlyX.total !== 1 || onlyX.accounts[0].userId !== other.user.id) return fail('provider filter wrong');
    if(!onlyX.accounts[0].userExists) return fail('userExists should be true for a live user');

    const [, page] = await listAccounts({ limit: 2, offset: 2 });
    if(page.accounts.length !== 1 || page.total !== 3) return fail('paging wrong');

    const [error] = await deleteAccountById(onlyX.accounts[0].id);
    if(error) return fail(error.msg);
    const [missing] = await deleteAccountById(onlyX.accounts[0].id);
    if(missing?.code !== 404) return fail('deleting twice should be a 404');

    const [, after] = await listAccounts({});
    if(after.total !== 2) return fail('the row was not removed');

    await purge();
    pass('list, filter, page, delete');
  },
};
