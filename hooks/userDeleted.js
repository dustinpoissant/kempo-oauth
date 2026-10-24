import { eq } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';
import { kempoOauthAccount as account } from '../server/db/schema.js';

/*
  kempo deleted a user (an administrator did it, or the person did from their account page). Their
  sign-in links here go with them, so nothing is left pointing at an account that no longer exists.
*/
export default async ({ id }) => {
  if(!id) return;
  await db.delete(account).where(eq(account.userId, id));
};
