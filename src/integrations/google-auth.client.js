import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';

const googleClient = new OAuth2Client();

/** Verifies signature, issuer, expiry and that the audience is OUR client id. Throws when invalid. */
export async function verifyGoogleIdToken(credential) {
  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
  return ticket.getPayload();
}
