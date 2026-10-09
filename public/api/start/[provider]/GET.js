import { getProvider } from '../../../../server/providers/index.js';
import { readGlobal, readProvider } from '../../../../server/utils/config/settings.js';
import { buildAuthorizeUrl } from '../../../../server/utils/flow/exchange.js';
import { challengeFor, randomToken } from '../../../../server/utils/flow/pkce.js';
import { encodeState, isMode } from '../../../../server/utils/flow/state.js';
import safePath from '../../../../server/utils/flow/safePath.js';
import originOf from '../../../../server/http/origin.js';
import { setFlowCookie } from '../../../../server/http/cookies.js';
import { sendBackWithError } from '../../../../server/http/redirects.js';

/*
  The first leg: the visitor clicked "Continue with Google", and this sends them there.

  A plain GET that answers with a redirect, so the buttons are ordinary links. They work before any
  script has loaded, with scripts blocked, and open in a new tab if the visitor wants them to.

  Nothing is stored on the server. What the callback will need to recognise this visitor coming back
  — the anti-forgery state, the PKCE verifier, the redirect URI used — goes in a short-lived
  HttpOnly cookie (server/utils/flow/state.js).
*/
export default async (request, response) => {
  const query = request.query || {};
  const mode = isMode(query.mode) ? query.mode : 'login';
  const next = safePath(query.next);

  const provider = getProvider(request.params?.provider);
  const config = provider ? await readProvider(provider) : null;
  if(!config?.active) return sendBackWithError(response, { mode, next, reason: 'unavailable' });

  const { baseUrl } = await readGlobal();
  const redirectUri = `${originOf(request, baseUrl)}/oauth/api/callback/${provider.name}`;

  const state = randomToken();
  const verifier = randomToken(48);

  setFlowCookie(
    response,
    encodeState({ state, verifier, provider: provider.name, redirectUri, mode, next }),
    { secure: redirectUri.startsWith('https:') },
  );

  response.redirect(buildAuthorizeUrl({ provider, config, redirectUri, state, challenge: challengeFor(verifier) }));
};
