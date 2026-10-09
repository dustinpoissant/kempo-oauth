/*
  A path on this site and nothing else — or an empty string.

  Anything that ends in a redirect goes through here first: `next` on the login page, the "after
  sign-in" setting. A redirect to a value the visitor controls is an open redirect, and a sign-in
  page is the worst place to have one, because the link is trusted for exactly as long as it takes
  to type a password (or approve a provider) and then sends them wherever the link said.

  What is refused: anything not starting with a single `/` (so no `https://evil.example`, and no
  `//evil.example`, which a browser reads as a scheme-relative URL), a backslash (browsers treat
  `/\evil.example` as `//evil.example`), and control characters, which can smuggle a newline into a
  header.
*/
export default value => {
  if(typeof value !== 'string') return '';
  if(value.length > 2048) return '';
  if(!value.startsWith('/') || value.startsWith('//')) return '';
  if(/[\\\u0000-\u001f\u007f]/.test(value)) return '';
  return value;
};
