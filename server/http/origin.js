/*
  The address this site is reached at, which the provider needs twice: as the `redirect_uri` it
  sends the visitor back to, and — character for character the same — when the code is exchanged.

  The `base_url` setting wins when it is set. Behind a reverse proxy or a TLS terminator the request
  this process sees says `http` and an internal host, and a redirect URI built from that does not
  match the one registered with the provider, which then refuses the sign-in with a message that
  mentions neither. Deriving from the request is only the default for the common case of a site that
  is reached directly (and for local development).

  The Host header is trusted for the fallback because the worst a forged one can do here is send
  *that same visitor's* sign-in to a redirect URI the provider has not registered, which the
  provider refuses.
*/
export default (request, configuredBaseUrl) => {
  if(configuredBaseUrl) return configuredBaseUrl;

  const headers = request.headers || {};
  const protocol = String(headers['x-forwarded-proto'] || '').split(',')[0].trim() || (request.socket?.encrypted ? 'https' : 'http');
  return `${protocol}://${headers.host}`;
};
