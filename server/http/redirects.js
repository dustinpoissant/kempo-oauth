import { isMode } from '../utils/flow/state.js';

/*
  Where a failed sign-in lands: back on the page the visitor started from, carrying a short code and
  never a message. The page maps the code to wording it owns (see public/components/OauthButtons.js),
  so nothing a provider or an attacker puts in a query string is ever reflected into the page.
*/
export const sendBackWithError = (response, { mode, next, reason }) => {
  const params = new URLSearchParams({ oauth_error: reason });
  if(next) params.set('next', next);
  return response.redirect(`/${isMode(mode) ? mode : 'login'}?${params}`);
};
