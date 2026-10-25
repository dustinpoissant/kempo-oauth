import crypto from 'crypto';
import { and, count, desc, eq } from 'drizzle-orm';
import { db, schema } from 'kempo/server/sdk.js';
import { kempoOauthAccount as account } from '../../db/schema.js';

/*
  Reading and writing the table of connected sign-in identities. Pure data in, error tuples out —
  nothing here knows what a request is.
*/

export const findAccount = async (provider, providerUserId) => {
  const [row] = await db.select().from(account)
    .where(and(eq(account.provider, provider), eq(account.providerUserId, providerUserId)))
    .limit(1);
  return row || null;
};

export const createAccount = async ({ provider, providerUserId, userId, email, name }) => {
  const now = new Date();
  const row = {
    id: crypto.randomBytes(16).toString('hex'),
    provider,
    providerUserId,
    userId,
    email: email || null,
    name: name || null,
    createdAt: now,
    lastLoginAt: now,
  };
  await db.insert(account).values(row);
  return row;
};

export const recordLogin = (id, { email, name }) =>
  db.update(account).set({ lastLoginAt: new Date(), email: email || null, name: name || null }).where(eq(account.id, id));

export const deleteAccountById = async id => {
  if(!id) return [{ code: 400, msg: 'An account id is required' }, null];

  try {
    const deleted = await db.delete(account).where(eq(account.id, id)).returning({ id: account.id });
    if(!deleted.length) return [{ code: 404, msg: 'No such connected account' }, null];
    return [null, { id }];
  } catch(error) {
    return [{ code: 500, msg: 'Failed to disconnect the account' }, null];
  }
};

// A replaced link: the row pointed at a user who no longer exists (see server/db/schema.js).
export const deleteAccountsForProviderUser = (provider, providerUserId) =>
  db.delete(account).where(and(eq(account.provider, provider), eq(account.providerUserId, providerUserId)));

export const listAccounts = async ({ limit = 25, offset = 0, provider = null, userId = null } = {}) => {
  const filters = [provider && eq(account.provider, provider), userId && eq(account.userId, userId)].filter(Boolean);
  const where = filters.length ? and(...filters) : undefined;
  const take = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
  const skip = Math.max(parseInt(offset, 10) || 0, 0);

  try {
    return await readPage({ where, take, skip });
  } catch(error) {
    return [{ code: 500, msg: 'Failed to list connected accounts' }, null];
  }
};

const readPage = async ({ where, take, skip }) => {
  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: account.id,
      provider: account.provider,
      providerUserId: account.providerUserId,
      userId: account.userId,
      email: account.email,
      name: account.name,
      createdAt: account.createdAt,
      lastLoginAt: account.lastLoginAt,
      userName: schema.user.name,
      userEmail: schema.user.email,
    })
      .from(account)
      .leftJoin(schema.user, eq(schema.user.id, account.userId))
      .where(where)
      .orderBy(desc(account.lastLoginAt))
      .limit(take)
      .offset(skip),
    db.select({ total: count() }).from(account).where(where),
  ]);

  return [null, { accounts: rows.map(row => ({ ...row, userExists: row.userName !== null })), total: Number(total), limit: take, offset: skip }];
};
