import { confirmPendingCode } from '../../../../server/utils/accounts/pending.js';
import { PENDING_COOKIE, clearPendingCookie, setSessionCookie } from '../../../../server/http/cookies.js';
import { readGlobal } from '../../../../server/utils/config/settings.js';
import originOf from '../../../../server/http/origin.js';

/*
  Checks the code. A right one creates or joins the account and starts the session, then tells the page where to go.
*/
export default async (request, response) => {
  const { baseUrl, afterLoginPath } = await readGlobal();
  const secure = originOf(request, baseUrl).startsWith('https:');

  const [error, result] = await confirmPendingCode({ id: request.cookies?.[PENDING_COOKIE], code: request.body?.code });
  if(error) return response.status(error.code).json({ error: error.msg });

  clearPendingCookie(response, { secure });

  if(result.requiresVerification) return response.json({ redirect: '/verify-email' });

  setSessionCookie(response, result);
  response.json({ redirect: result.next || afterLoginPath });
};
