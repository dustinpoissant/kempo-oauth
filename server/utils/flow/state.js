import crypto from 'crypto';

/*
  What the visitor's browser carries across the trip to the provider and back, as one cookie.

  The flow is stateless on the server on purpose. A table of pending sign-ins would need cleaning,
  would grow under a flood of abandoned attempts, and would need an index kempo's installer does
  not create. The cookie holds everything instead — the anti-forgery `state` the provider echoes
  back, the PKCE verifier, the exact redirect URI used, and where to send the visitor afterwards —
  and is HttpOnly so no script on the page can read it.

  None of it needs to be tamper-proof, because none of it is trusted on its own: the callback
  compares the cookie's `state` against the one the provider returned, and a forged cookie cannot
  produce a code the provider will honour. The fields that steer the visitor afterwards (`next`,
  `mode`) are re-validated when they are used, not here.
*/

const MODES = ['login', 'register'];

export const encodeState = state => Buffer.from(JSON.stringify(state)).toString('base64url');

export const decodeState = value => {
  if(typeof value !== 'string' || !value) return null;

  let state;
  try {
    state = JSON.parse(Buffer.from(decodeURIComponent(value), 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const strings = ['state', 'verifier', 'provider', 'redirectUri', 'next'];
  if(!state || typeof state !== 'object' || strings.some(key => typeof state[key] !== 'string')) return null;
  if(!MODES.includes(state.mode)) return null;

  return state;
};

export const sameState = (a, b) => {
  if(typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

export const isMode = value => MODES.includes(value);
