import { sendPendingCode } from '../../../../server/utils/accounts/pending.js';
import { PENDING_COOKIE } from '../../../../server/http/cookies.js';

/*
  Sends the six-digit code to the address the person typed. Only the sign-in in this browser can ask.
*/
export default async (request, response) => {
  const [error, result] = await sendPendingCode({ id: request.cookies?.[PENDING_COOKIE], email: request.body?.email });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(result);
};
