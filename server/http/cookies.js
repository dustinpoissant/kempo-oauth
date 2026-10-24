/*
  The two cookies this extension deals in.

  `kempo_oauth` carries the sign-in in flight (see server/utils/flow/state.js). Its path is narrowed
  to this extension's own routes so the rest of the site never receives it, and it is `lax` rather
  than `strict` because the provider sends the visitor back with a cross-site top-level navigation,
  and a strict cookie is withheld from exactly that.

  `session_token` is set the way kempo's own login route sets it — same name, same attributes — so
  a session created here is indistinguishable from one created by typing a password.

  **`response.cookie` cannot delete.** It only writes `Max-Age` when the value is truthy, so
  `maxAge: 0` quietly produces a session cookie holding an empty string instead of an expired one.
  Clearing the flow cookie therefore overwrites it with nothing and a one-second life, which is
  gone before the next request and decodes to "no sign-in in progress" in the meantime.
*/

export const FLOW_COOKIE = 'kempo_oauth';

export const PENDING_COOKIE = 'kempo_oauth_pending';

const FLOW_PATH = '/oauth/api';

const FLOW_MAX_AGE_SECONDS = 10 * 60;

const PENDING_MAX_AGE_SECONDS = 15 * 60;

const flowOptions = (secure, maxAge) => ({ httpOnly: true, secure, sameSite: 'lax', path: FLOW_PATH, maxAge });

export const setFlowCookie = (response, value, { secure }) => {
  response.cookie(FLOW_COOKIE, value, flowOptions(secure, FLOW_MAX_AGE_SECONDS));
};

export const clearFlowCookie = (response, { secure }) => {
  response.cookie(FLOW_COOKIE, '', flowOptions(secure, 1));
};

export const setPendingCookie = (response, id, { secure }) => {
  response.cookie(PENDING_COOKIE, id, flowOptions(secure, PENDING_MAX_AGE_SECONDS));
};

export const clearPendingCookie = (response, { secure }) => {
  response.cookie(PENDING_COOKIE, '', flowOptions(secure, 1));
};

export const setSessionCookie = (response, { sessionToken, expiresAt }) => {
  response.cookie('session_token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 1),
  });
};
