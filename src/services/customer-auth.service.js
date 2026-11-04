import { CUSTOMER_SESSION_LIFETIME_MS } from '../config/cookies.js';
import { Customer, CustomerSession } from '../models/index.js';
import { verifyGoogleIdToken } from '../integrations/google-auth.client.js';
import { nonceMatches } from '../utils/nonce.js';
import { generateSessionToken, hashSessionToken } from '../utils/tokens.js';

const GOOGLE_AVATAR_PREFIX = 'https://lh3.googleusercontent.com/';

/**
 * Returns the Google profile when the token is valid, was issued for THIS browser's nonce, and the email is
 * verified. Otherwise null. The nonce makes a stolen or replayed Google token useless: it only works in the
 * browser that asked for that nonce, once.
 */
export async function verifyGoogleSignIn(credential, expectedNonce) {
  let profile;
  try {
    profile = await verifyGoogleIdToken(credential);
  } catch {
    return null;
  }
  if (!nonceMatches(expectedNonce, profile?.nonce)) return null;
  const isUsable = profile?.sub && profile.email && profile.email_verified;
  return isUsable ? profile : null;
}

/** Creates or updates the customer for a Google profile and starts a session. Returns the customer and raw token. */
export async function signInCustomer(profile) {
  // Google's guidance: gmail.com addresses and Workspace domains (hd) are authoritative.
  const email = profile.email.toLowerCase();
  const trusted = email.endsWith('@gmail.com') || Boolean(profile.hd);
  const picture = profile.picture?.startsWith(GOOGLE_AVATAR_PREFIX) ? profile.picture : '';

  const customer = await Customer.findOneAndUpdate(
    { googleSub: profile.sub },
    { $set: { email, name: String(profile.name ?? '').slice(0, 120), picture, trusted } },
    { upsert: true, new: true },
  );

  const token = generateSessionToken();
  await CustomerSession.create({
    tokenHash: hashSessionToken(token),
    customer: customer._id,
    expiresAt: new Date(Date.now() + CUSTOMER_SESSION_LIFETIME_MS),
  });
  return { customer, token };
}
