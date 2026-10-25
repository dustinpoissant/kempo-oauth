import { listAccounts } from '../../../server/utils/accounts/store.js';
import { listProviders } from '../../../server/providers/index.js';
import { gate } from '../../../server/http/gate.js';

/*
  The connected sign-in identities, newest activity first, optionally for one user (the "Connected accounts" tab on a user's admin page).
*/
export default async (request, response) => {
  const [gateError] = await gate(request, 'oauth:view');
  if(gateError) return response.status(gateError.code).json({ error: gateError.msg });

  const query = request.query || {};
  const [error, result] = await listAccounts({ limit: query.limit, offset: query.offset, provider: query.provider || null, userId: query.userId || null });
  if(error) return response.status(error.code).json({ error: error.msg });

  // Every registered provider, not only active ones: a provider that was switched off can still have accounts.
  response.json({ ...result, providers: listProviders().map(({ name, label }) => ({ name, label })) });
};
