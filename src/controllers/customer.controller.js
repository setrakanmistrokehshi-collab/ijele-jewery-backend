import { CUSTOMER_SESSION_COOKIE, GOOGLE_NONCE_COOKIE } from '../config/constants.js';
import { customerSessionCookie, googleNonceCookie, withoutMaxAge } from '../config/cookies.js';
import { env } from '../config/env.js';
import { CustomerSession, Order } from '../models/index.js';
import { toCustomerOrderView } from '../serializers/order.serializer.js';
import { toPublicCustomer } from '../serializers/customer.serializer.js';
import { signInCustomer, verifyGoogleSignIn } from '../services/customer-auth.service.js';
import { createPushId } from '../services/notification.service.js';
import { generateNonce } from '../utils/nonce.js';
import { hashSessionToken } from '../utils/tokens.js';
import { googleSignInSchema } from '../validators/customer.validators.js';

/**
 * Step 1 of sign-in: hand the browser a one-time nonce. It is kept in an HttpOnly cookie AND returned in the body;
 * the page gives it to Google, Google puts it inside the signed token, and step 2 checks both match.
 */
export function issueGoogleNonce(_request, response) {
  if (!env.GOOGLE_CLIENT_ID) return response.status(503).json({ error: 'Google sign-in is not configured' });
  const nonce = generateNonce();
  return response.cookie(GOOGLE_NONCE_COOKIE, nonce, googleNonceCookie).json({ nonce });
}

/** Step 2: verify Google's token against the nonce cookie. The nonce is single-use: it is cleared either way. */
export async function signInWithGoogle(request, response) {
  if (!env.GOOGLE_CLIENT_ID) return response.status(503).json({ error: 'Google sign-in is not configured' });
  const { credential } = googleSignInSchema.parse(request.body);
  const expectedNonce = request.cookies?.[GOOGLE_NONCE_COOKIE];
  response.clearCookie(GOOGLE_NONCE_COOKIE, withoutMaxAge(googleNonceCookie));

  const profile = await verifyGoogleSignIn(credential, expectedNonce);
  if (!profile) return response.status(401).json({ error: 'Invalid sign-in' });

  // Signing in again replaces the old session instead of leaving it valid until it expires.
  const previousToken = request.cookies?.[CUSTOMER_SESSION_COOKIE];
  if (typeof previousToken === 'string') await CustomerSession.deleteOne({ tokenHash: hashSessionToken(previousToken) });

  const { customer, token } = await signInCustomer(profile);
  return response
    .cookie(CUSTOMER_SESSION_COOKIE, token, customerSessionCookie)
    .json({ user: toPublicCustomer(customer) });
}

export const getCurrentCustomer = (request, response) => response.json({ user: toPublicCustomer(request.customer) });

export async function signOutCustomer(request, response) {
  const token = request.cookies?.[CUSTOMER_SESSION_COOKIE];
  if (typeof token === 'string') await CustomerSession.deleteOne({ tokenHash: hashSessionToken(token) });
  response.clearCookie(CUSTOMER_SESSION_COOKIE, withoutMaxAge(customerSessionCookie)).json({ ok: true });
}

export async function listCustomerOrders(request, response) {
  const ownership = [{ customer: request.customer._id }];
  if (request.customer.trusted) {
    ownership.push({ customer: { $exists: false }, email: request.customer.email });
  }
  const orders = await Order.find({ $or: ownership, status: 'paid' }).sort({ createdAt: -1 }).limit(50).lean();
  return response.json({
    pushId: request.customer.trusted ? createPushId(request.customer.email) : undefined,
    orders: orders.map(toCustomerOrderView),
  });
}
