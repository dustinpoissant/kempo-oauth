import { getProvider } from '../../../../server/providers/index.js';
import { readGlobal, readProvider } from '../../../../server/utils/config/settings.js';
import { exchangeCode, fetchProfile } from '../../../../server/utils/flow/exchange.js';
import { decodeState, sameState } from '../../../../server/utils/flow/state.js';
import safePath from '../../../../server/utils/flow/safePath.js';
import signIn from '../../../../server/utils/accounts/signIn.js';
import { FLOW_COOKIE, clearFlowCookie, setSessionCookie } from '../../../../server/http/cookies.js';
import { sendBackWithError } from '../../../../server/http/redirects.js';
import { findAccount } from '../../../../server/utils/accounts/store.js';
import { startPending } from '../../../../server/utils/accounts/pending.js';
import { setPendingCookie } from '../../../../server/http/cookies.js';

/*
  The second leg: the provider sends the visitor back here with a code, or with an error if they
  said no.

  Every way this can go wrong ends the same way — the visitor lands back on the page they started
  from with a short `oauth_error` code — because there is nobody to show a stack trace to, and a
  half-finished sign-in must never leave a half-created session behind. The detail goes to the
  server log, where the person who can fix a wrong client secret will actually look.

  The order matters. The state is checked before anything the provider said is believed, including
  its error: a request that cannot prove it belongs to a sign-in this browser started gets nothing,
  not even a helpful message.
*/
export default async (request, response) => {
  const query = request.query || {};
  const flow = decodeState(request.cookies?.[FLOW_COOKIE]);
  const provider = getProvider(request.params?.provider);

  const mode = flow?.mode || 'login';
  const next = flow ? safePath(flow.next) : '';
  const secure = !!flow?.redirectUri?.startsWith('https:');

  const bail = (reason, detail) => {
    if(detail) console.warn(`[kempo-oauth] ${provider?.name || request.params?.provider} sign-in stopped (${reason}): ${detail}`);
    clearFlowCookie(response, { secure });
    return sendBackWithError(response, { mode, next, reason });
  };

  if(!flow || !provider || flow.provider !== provider.name || !sameState(flow.state, query.state)) return bail('state');
  if(query.error) return bail(query.error === 'access_denied' ? 'denied' : 'failed', query.error_description || query.error);
  if(typeof query.code !== 'string' || !query.code) return bail('failed', 'no code in the provider’s reply');

  const config = await readProvider(provider);
  if(!config.active) return bail('unavailable');

  const [exchangeError, tokenResponse] = await exchangeCode({ provider, config, code: query.code, redirectUri: flow.redirectUri, verifier: flow.verifier });
  if(exchangeError) return bail('exchange', exchangeError.detail || exchangeError.msg);

  const [profileError, profile] = await fetchProfile({ provider, tokenResponse });
  if(profileError) return bail('profile', profileError.detail || profileError.msg);

  // A provider that shares no email cannot be matched to anyone yet, so the person is asked for one first. Already-linked people skip it.
  if(!profile.email && !(await findAccount(provider.name, profile.id))){
    const [pendingError, pending] = await startPending({ provider, profile, mode, next });
    if(pendingError) return bail('failed', pendingError.msg);

    clearFlowCookie(response, { secure });
    setPendingCookie(response, pending.id, { secure });
    return response.redirect(`/${mode}?oauth_pending=1`);
  }

  const [signInError, result] = await signIn({ provider, profile });
  if(signInError) return bail(signInError.reason || 'failed', signInError.reason ? null : signInError.msg);

  clearFlowCookie(response, { secure });

  if(result.requiresVerification) return response.redirect('/verify-email');

  setSessionCookie(response, result);

  const { afterLoginPath } = await readGlobal();
  response.redirect(next || afterLoginPath);
};
