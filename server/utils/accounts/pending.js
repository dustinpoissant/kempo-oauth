import crypto from 'crypto';
import { and, eq, lt } from 'drizzle-orm';
import { db, sendEmailFromTemplate } from 'kempo/server/sdk.js';
import { kempoOauthPending } from '../../db/schema.js';
import { getProvider } from '../../providers/index.js';
import { OWNER } from '../config/settings.js';
import signIn from './signIn.js';

/*
  A provider finished the sign-in but shared no email address (X does not), so there is no way to tell
  whether the person already has an account here. They are asked for an address, and a six-digit code is
  sent to it. Only a right code creates or joins an account, and it is the code that proves the address,
  so the profile is handed to signIn as verified.

  Nothing is created before that. An abandoned attempt leaves one row, which expires and is removed.

  Returns `[error, result]` like the other utils. Errors carry `code` and a `msg` the dialog can show.
*/

const TTL_MINUTES = 15;
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const fail = (code, msg) => [{ code, msg }, null];

const hashCode = (id, code) => crypto.createHash('sha256').update(`${id}:${code}`).digest('hex');

const liveRow = async (id, now) => {
  if(!id) return null;
  const [row] = await db.select().from(kempoOauthPending).where(eq(kempoOauthPending.id, id)).limit(1);
  if(!row || row.expiresAt < now) return null;
  return row;
};

export const startPending = async ({ provider, profile, mode, next, now = new Date() }) => {
  await db.delete(kempoOauthPending).where(lt(kempoOauthPending.expiresAt, now));

  const id = crypto.randomBytes(32).toString('hex');
  await db.insert(kempoOauthPending).values({
    id,
    provider: provider.name,
    providerUserId: profile.id,
    name: profile.name || null,
    mode,
    next: next || '',
    email: null,
    codeHash: null,
    codeSentAt: null,
    attempts: 0,
    expiresAt: new Date(now.getTime() + TTL_MINUTES * 60 * 1000),
  });

  return [null, { id }];
};

export const describePending = async ({ id, now = new Date() }) => {
  const row = await liveRow(id, now);
  if(!row) return fail(404, 'That sign-in has expired. Start again');

  return [null, {
    provider: row.provider,
    label: getProvider(row.provider)?.label ?? row.provider,
    mode: row.mode,
    email: row.email,
  }];
};

export const sendPendingCode = async ({ id, email, now = new Date(), makeCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0'), send = sendEmailFromTemplate }) => {
  const address = String(email ?? '').trim().toLowerCase();
  if(!EMAIL_PATTERN.test(address)) return fail(400, 'Enter a valid email address');

  const row = await liveRow(id, now);
  if(!row) return fail(404, 'That sign-in has expired. Start again');

  if(row.codeSentAt && now - row.codeSentAt < RESEND_MS) return fail(429, 'A code was sent a moment ago. Wait a minute before asking for another');

  const label = getProvider(row.provider)?.label ?? row.provider;
  const code = makeCode();

  const [mailError] = await send({
    to: address,
    subject: `Your code to finish signing in with ${label}`,
    template: `${OWNER}/sign-in-code`,
    data: { name: row.name || '', code, minutes: TTL_MINUTES, providerLabel: label },
  });
  // Saved in the email log and sent when a sender is ready, so that still counts as sent.
  if(mailError && !mailError.emailId) return fail(502, 'The email could not be sent right now. Try again in a minute');

  await db.update(kempoOauthPending)
    .set({ email: address, codeHash: hashCode(id, code), codeSentAt: now, attempts: 0 })
    .where(eq(kempoOauthPending.id, id));

  return [null, { sent: true }];
};

export const confirmPendingCode = async ({ id, code, now = new Date() }) => {
  const row = await liveRow(id, now);
  if(!row) return fail(404, 'That sign-in has expired. Start again');
  if(!row.codeHash) return fail(400, 'Ask for a code first');
  if(row.attempts >= MAX_ATTEMPTS) return fail(429, 'Too many wrong tries. Ask for a new code');

  const given = String(code ?? '').replace(/\s/g, '');
  if(!/^\d{6}$/.test(given) || hashCode(id, given) !== row.codeHash){
    await db.update(kempoOauthPending).set({ attempts: row.attempts + 1 }).where(eq(kempoOauthPending.id, id));
    return fail(400, 'That code is not right');
  }

  // Taken out of the table in one step, so the same code cannot be spent twice by two requests at once.
  const used = await db.delete(kempoOauthPending)
    .where(and(eq(kempoOauthPending.id, id), eq(kempoOauthPending.codeHash, row.codeHash)))
    .returning({ id: kempoOauthPending.id });
  if(!used.length) return fail(400, 'That code has already been used');

  const provider = getProvider(row.provider);
  if(!provider) return fail(404, 'That way of signing in is no longer available');

  const [error, result] = await signIn({
    provider,
    profile: { id: row.providerUserId, email: row.email, emailVerified: true, name: row.name, avatarUrl: null },
  });
  if(error) return [error, null];

  return [null, { ...result, next: row.next }];
};

export const cancelPending = async ({ id }) => {
  if(!id) return [null, { cancelled: true }];
  await db.delete(kempoOauthPending).where(eq(kempoOauthPending.id, id));
  return [null, { cancelled: true }];
};
