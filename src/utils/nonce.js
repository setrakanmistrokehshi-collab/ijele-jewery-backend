import crypto from 'node:crypto';

export const generateNonce = () => crypto.randomBytes(24).toString('base64url');

/** Constant-time comparison, so response timing cannot be used to guess a nonce. */
export function nonceMatches(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string' || expected.length === 0) return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && crypto.timingSafeEqual(expectedBytes, actualBytes);
}
