import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
