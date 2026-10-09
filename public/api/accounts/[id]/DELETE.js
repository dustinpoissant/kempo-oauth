import { deleteAccountById } from '../../../../server/utils/accounts/store.js';
import { gate } from '../../../../server/http/gate.js';

/*
  Disconnects one sign-in identity from its user. The user and their data are untouched; they can
  still sign in however else they could, and signing in with that provider again will connect a
  fresh row (to the same user if the provider vouches for their email, otherwise as a new account).
*/
export default async (request, response) => {
  const [gateError] = await gate(request, 'oauth:unlink');
  if(gateError) return response.status(gateError.code).json({ error: gateError.msg });

  const [error, result] = await deleteAccountById(request.params?.id);
  if(error) return response.status(error.code).json({ error: error.msg });

  response.json(result);
};
