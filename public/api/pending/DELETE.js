import { cancelPending } from '../../../server/utils/accounts/pending.js';
import { PENDING_COOKIE, clearPendingCookie } from '../../../server/http/cookies.js';
import { readGlobal } from '../../../server/utils/config/settings.js';
import originOf from '../../../server/http/origin.js';

/*
  The person closed the dialog without finishing. The sign-in is dropped now, so they can start again at once.
*/
export default async (request, response) => {
  const { baseUrl } = await readGlobal();
  const secure = originOf(request, baseUrl).startsWith('https:');

  const [error, result] = await cancelPending({ id: request.cookies?.[PENDING_COOKIE] });
  if(error) return response.status(error.code).json({ error: error.msg });

  clearPendingCookie(response, { secure });
  response.json(result);
};
