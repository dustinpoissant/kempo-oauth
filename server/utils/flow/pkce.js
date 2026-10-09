import crypto from 'crypto';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

// RFC 7636 S256: the verifier stays in the visitor's cookie, only this digest goes to the provider.
export const challengeFor = verifier => crypto.createHash('sha256').update(verifier).digest('base64url');
