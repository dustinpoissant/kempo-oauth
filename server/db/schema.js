import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core';

/*
  One row per sign-in identity a person has connected: "this Google account is that kempo user".

  Nothing sensitive is kept. The provider's access token is used once, inside the callback, to read
  the profile and is then thrown away — this extension never calls a provider on a user's behalf
  later, so there is no reason to hold a credential that could.

  `providerUserId` is the provider's own stable id for the person (Google's `sub`, GitHub's numeric
  id). It is the join, never the email: an email address can change hands, be unverified, or not
  exist at all (X does not share one), while the id does not.

  `email` and `name` are a snapshot of what the provider said at the last sign-in, kept so the admin
  can tell the rows apart. They are not read back for authentication.

  There is no foreign key to `user`, because kempo's installer carries columns and primary keys
  across and nothing else — and a user deleted from the admin takes their sessions with them but not
  this table. A row pointing at a user that no longer exists is expected, and the sign-in path
  treats one as "not linked" and replaces it rather than trusting it.
*/
export const kempoOauthAccount = pgTable('kempoOauthAccount', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  providerUserId: text('providerUserId').notNull(),
  userId: text('userId').notNull(),
  email: text('email'),
  name: text('name'),
  createdAt: timestamp('createdAt').notNull(),
  lastLoginAt: timestamp('lastLoginAt').notNull(),
});

/*
  One row per data-deletion request a provider has sent (see server/utils/deletion/erase.js).

  Facebook asks for a confirmation code in the answer to such a request and shows the person a link
  that must later say what became of it, so the code is what the status page looks up. The row holds
  no personal data on purpose: what the request was *about* has just been deleted, and a record
  that kept the provider's user id would be the very thing the person asked to have removed.

  `status` is `deleted` (the account and every sign-in link were removed), `unlinked` (the person's
  account stayed, because it is an administrator's, and only this provider's link was removed) or
  `nothing` (this site held nothing for that person).
*/
export const kempoOauthDeletion = pgTable('kempoOauthDeletion', {
  code: text('code').primaryKey(),
  provider: text('provider').notNull(),
  status: text('status').notNull(),
  requestedAt: timestamp('requestedAt').notNull(),
});

/*
  A sign-in a provider completed without sharing an email address (X), waiting for the person to type one
  in and prove they can read it. No account exists until the code is right (server/utils/accounts/pending.js).

  Found by a random id that lives in an HttpOnly cookie. `codeHash` is a hash of the code, never the code,
  so a copy of this table cannot be used to sign in. A row lasts fifteen minutes and is removed when used.
*/
export const kempoOauthPending = pgTable('kempoOauthPending', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  providerUserId: text('providerUserId').notNull(),
  name: text('name'),
  mode: text('mode').notNull(),
  next: text('next').notNull(),
  email: text('email'),
  codeHash: text('codeHash'),
  codeSentAt: timestamp('codeSentAt'),
  attempts: integer('attempts').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
});
