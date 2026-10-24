import { describePending } from '../../../server/utils/accounts/pending.js';
import { PENDING_COOKIE } from '../../../server/http/cookies.js';

/*
  What the sign-in waiting for an email address is, so the dialog can say whose sign-in it is.
*/
export default async (request, response) => {
  const [error, result] = await describePending({ id: request.cookies?.[PENDING_COOKIE] });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(result);
};
