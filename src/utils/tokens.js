import crypto from 'node:crypto';

/** Opaque random session token. Only its SHA-256 hash is ever stored in the database. */
export const generateSessionToken = () => crypto.randomBytes(32).toString('base64url');
export const hashSessionToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
