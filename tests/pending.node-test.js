import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from 'kempo/server/sdk.js';
import { kempoOauthPending } from '../server/db/schema.js';
import { startPending, describePending, sendPendingCode, confirmPendingCode, cancelPending } from '../server/utils/accounts/pending.js';
import { findAccount } from '../server/utils/accounts/store.js';
import install from '../install.js';
import { databaseReachable, skipReason } from './testDatabase.js';
import { EMAIL_PREFIX, makeUser, purge } from './helpers.js';

/*
  A sign-in from a provider that shares no email address (X): the person types one in and proves it with
  a code, and only then is an account created or joined. Fixed codes are passed in, so the tests know them.
*/

const skipped = reason => ({
  'pending sign-in (SKIPPED)': async ({ pass }) => pass(`skipped: ${reason}`),
});

const x = { name: 'x', label: 'X' };

// Templates are found in node_modules, which a checkout of this package does not have, so the send is stubbed.
const send = async () => [null, { sent: true }];

const address = () => `${EMAIL_PREFIX}pending-${crypto.randomBytes(4).toString('hex')}@example.com`;

const begin = async (overrides = {}) => {
  const [, started] = await startPending({
    provider: x,
    profile: { id: `x-${crypto.randomBytes(4).toString('hex')}`, name: 'Pending Person' },
    mode: 'register',
    next: '',
    ...overrides,
  });
  return started.id;
};

const cleanPending = async () => {
  await db.delete(kempoOauthPending);
};

if(databaseReachable) await install();

export default !databaseReachable ? skipped(`${skipReason} — point DATABASE_URL at a *_test database and run drizzle-kit push`) : {
  'starting a sign-in stores a row and creates no account': async ({ pass, fail }) => {
    await purge();
    await cleanPending();
    const profileId = `x-${crypto.randomBytes(4).toString('hex')}`;
    const [, started] = await startPending({ provider: x, profile: { id: profileId, name: 'A' }, mode: 'login', next: '' });

    const [row] = await db.select().from(kempoOauthPending).where(eq(kempoOauthPending.id, started.id));
    if(!row || row.providerUserId !== profileId) return fail('no pending row was stored');
    if(await findAccount('x', profileId)) return fail('an account link was made before the code was checked');

    await cleanPending();
    pass('row stored, no link yet');
  },

  'an address that is not an address is refused before anything is sent': async ({ pass, fail }) => {
    await cleanPending();
    const id = await begin();
    const [error] = await sendPendingCode({ send, id, email: 'not an email' });
    if(error?.code !== 400) return fail(`expected 400, got ${JSON.stringify(error)}`);

    await cleanPending();
    pass('400 for a bad address');
  },

  'a right code creates the account with that address, verified, and the code is spent': async ({ pass, fail }) => {
    await purge();
    await cleanPending();
    const id = await begin();
    const email = address();

    const [sendError] = await sendPendingCode({ send, id, email, makeCode: () => '123456' });
    if(sendError) return fail(`send: ${sendError.msg}`);

    const [error, result] = await confirmPendingCode({ id, code: '123456' });
    if(error) return fail(`confirm: ${error.msg}`);
    if(result.user.email !== email || !result.user.emailVerified) return fail(`user was ${JSON.stringify(result.user)}`);
    if(!result.sessionToken) return fail('no session');

    const [again] = await confirmPendingCode({ id, code: '123456' });
    if(again?.code !== 404) return fail('the same code was accepted twice');

    await purge();
    pass('account made only after the code, and the code cannot be reused');
  },

  'a wrong code is counted, and five of them end the attempt even when the next one is right': async ({ pass, fail }) => {
    await purge();
    await cleanPending();
    const id = await begin();
    await sendPendingCode({ send, id, email: address(), makeCode: () => '654321' });

    for(let i = 0; i < 5; i++){
      const [error] = await confirmPendingCode({ id, code: '000000' });
      if(error?.code !== 400) return fail(`wrong code ${i + 1}: ${JSON.stringify(error)}`);
    }

    const [locked] = await confirmPendingCode({ id, code: '654321' });
    if(locked?.code !== 429) return fail(`expected 429 after five tries, got ${JSON.stringify(locked)}`);

    await cleanPending();
    pass('five wrong tries lock the code');
  },

  'a code is not sent again within a minute': async ({ pass, fail }) => {
    await cleanPending();
    const id = await begin();
    const [first] = await sendPendingCode({ send, id, email: address(), makeCode: () => '111111' });
    if(first) return fail(`first send: ${first.msg}`);

    const [second] = await sendPendingCode({ send, id, email: address(), makeCode: () => '222222' });
    if(second?.code !== 429) return fail(`expected 429, got ${JSON.stringify(second)}`);

    await cleanPending();
    pass('second request inside a minute is refused');
  },

  'a sign-in left for fifteen minutes is refused': async ({ pass, fail }) => {
    await cleanPending();
    const long = new Date(Date.now() - 20 * 60 * 1000);
    const id = await begin();
    await db.update(kempoOauthPending).set({ expiresAt: long }).where(eq(kempoOauthPending.id, id));

    const [error] = await describePending({ id });
    if(error?.code !== 404) return fail(`expected 404, got ${JSON.stringify(error)}`);

    await cleanPending();
    pass('an expired sign-in is gone');
  },

  'an address that already has an account is joined only after the code, and only that account': async ({ pass, fail }) => {
    await purge();
    await cleanPending();
    const existing = await makeUser('pending-existing');
    const id = await begin();

    await sendPendingCode({ send, id, email: existing.email, makeCode: () => '987654' });
    const [error, result] = await confirmPendingCode({ id, code: '987654' });
    if(error) return fail(`confirm: ${error.msg}`);
    if(result.user.id !== existing.id) return fail('did not join the existing account');
    if(result.isNew) return fail('reported as new');

    const rows = await db.select().from(schema.user).where(eq(schema.user.email, existing.email));
    if(rows.length !== 1) return fail('a second account was made for the same address');

    await purge();
    pass('joined the existing account once the address was proven');
  },

  'cancelling drops the sign-in, so the same address can start again at once': async ({ pass, fail }) => {
    await cleanPending();
    const id = await begin();
    await cancelPending({ id });

    const [error] = await describePending({ id });
    if(error?.code !== 404) return fail(`expected 404 after cancel, got ${JSON.stringify(error)}`);

    const again = await begin();
    const [sent] = await sendPendingCode({ send, id: again, email: address(), makeCode: () => '333333' });
    if(sent) return fail(`a new sign-in could not send: ${sent.msg}`);

    await cleanPending();
    pass('cancelled row is gone; a new sign-in works immediately');
  },
};
