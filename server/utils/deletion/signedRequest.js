import crypto from 'crypto';

/*
  Facebook's "signed request": `<signature>.<payload>`, both base64url, where the signature is the
  HMAC-SHA256 of the payload *as sent* keyed with the app secret. It is the only thing that says a
  data-deletion callback really came from Facebook, so it is checked before anything is read from it
  and compared in constant time.

  Resolves to [null, { userId }] — the app-scoped user id, which is the same `id` Facebook returns
  from `/me` at sign-in and so the `providerUserId` this extension stored — or an error tuple. A
  signature that does not match is a 401, anything malformed a 400.
*/

const decode = value => Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export default (signedRequest, secret) => {
  if(typeof signedRequest !== 'string' || !signedRequest) return [{ code: 400, msg: 'A signed_request is required' }, null];
  if(!secret) return [{ code: 400, msg: 'This provider has no client secret to check the request against' }, null];

  const parts = signedRequest.split('.');
  if(parts.length !== 2 || !parts[0] || !parts[1]) return [{ code: 400, msg: 'The signed_request is not in the form signature.payload' }, null];
  const [signature, payload] = parts;

  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const given = decode(signature);
  if(given.length !== expected.length || !crypto.timingSafeEqual(given, expected)){
    return [{ code: 401, msg: 'The signature of the request is not valid' }, null];
  }

  let data;
  try {
    data = JSON.parse(decode(payload).toString('utf8'));
  } catch {
    return [{ code: 400, msg: 'The payload of the request is not valid JSON' }, null];
  }

  if(String(data?.algorithm || '').toUpperCase() !== 'HMAC-SHA256') return [{ code: 400, msg: 'The request is signed with an algorithm that is not supported' }, null];

  const userId = String(data.user_id ?? '').trim();
  if(!userId) return [{ code: 400, msg: 'The request does not say whose data to delete' }, null];

  return [null, { userId }];
};
