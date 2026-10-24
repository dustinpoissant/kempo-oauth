import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, deleteUser, userHasPermission } from 'kempo/server/sdk.js';
import { kempoOauthAccount as account, kempoOauthDeletion as deletion } from '../../db/schema.js';

/*
  A provider says one of its people asked for the data it gave this site to be deleted. This removes
  everything this site holds for that person and writes down what it did under a confirmation code
  the person can look up (see ../../../public/api/data-deletion-status).

  **Whose data.** The provider names its own id for the person, which is the `providerUserId` the
  sign-in stored. Every sign-in link of the user it points to is removed, and then the user: a
  kempo user created by a provider sign-in carries that provider's name and email, so leaving the
  account behind would leave the data the person asked to have deleted. Sessions, group
  memberships and verification tokens go with it (kempo's own `deleteUser`). Whatever *other*
  extensions keep about a user is theirs to remove; kempo has no "user deleted" hook to tell them.

  **The exception: administrators.** A provider can reach this code with nothing but a request it
  signed, and deleting an administrator's account because they removed an app from their Facebook
  settings could lock a site out of its own admin. Their sign-in link with *this provider* is removed
  (so what the provider shared is gone and they can no longer sign in that way) and the account
  stays, which the status page says in so many words.

  Idempotent, because providers retry: asking again for a person already deleted finds nothing and
  answers `nothing` under a new code.

  Resolves to [null, { code, status }].
*/
export default async ({ provider, providerUserId }) => {
  if(!provider || !providerUserId) return [{ code: 400, msg: 'A provider and the provider’s user id are required' }, null];

  let status = 'nothing';

  try {
    const links = await db.select().from(account).where(and(eq(account.provider, provider), eq(account.providerUserId, String(providerUserId))));

    for(const link of links){
      // If kempo cannot say whether this is an administrator, nothing is deleted: the provider will ask again.
      const [permissionError, isAdministrator] = await userHasPermission(link.userId, 'system:admin:access');
      if(permissionError) return [permissionError, null];

      if(isAdministrator){
        await db.delete(account).where(eq(account.id, link.id));
        status = status === 'deleted' ? status : 'unlinked';
        continue;
      }

      await db.delete(account).where(eq(account.userId, link.userId));
      const [error] = await deleteUser(link.userId);
      if(error) return [error, null];
      status = 'deleted';
    }
  } catch(error) {
    return [{ code: 500, msg: 'The data could not be deleted' }, null];
  }

  const code = crypto.randomBytes(16).toString('hex');
  await db.insert(deletion).values({ code, provider, status, requestedAt: new Date() });

  return [null, { code, status }];
};
