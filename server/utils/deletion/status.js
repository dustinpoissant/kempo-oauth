import { eq } from 'drizzle-orm';
import { db } from 'kempo/server/sdk.js';
import { kempoOauthDeletion as deletion } from '../../db/schema.js';

/*
  What became of one deletion request, by the confirmation code the provider was given. Public on
  purpose — the person arrives from the provider with nothing but the code in the link — and safe
  to be, because the answer names no one and the code is 128 random bits.
*/
export default async code => {
  if(typeof code !== 'string' || !/^[a-f0-9]{32}$/.test(code)) return [{ code: 400, msg: 'That is not a confirmation code' }, null];

  const [row] = await db.select().from(deletion).where(eq(deletion.code, code)).limit(1);
  if(!row) return [{ code: 404, msg: 'There is no request with that confirmation code' }, null];

  return [null, { status: row.status, provider: row.provider, requestedAt: row.requestedAt }];
};
