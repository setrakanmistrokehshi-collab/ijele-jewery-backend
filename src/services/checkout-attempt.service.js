// Idempotency for "create checkout". A key is scoped to the customer and basket, never shared across accounts.
import crypto from 'node:crypto';
import { CheckoutAttempt, Order } from '../models/index.js';
import { HttpError } from '../utils/http-error.js';

const STALE_ATTEMPT_AFTER_MS = 2 * 60 * 1000; // a request still "processing" after this is presumed to have crashed
const DUPLICATE_KEY_ERROR_CODE = 11000;

export const fingerprintCart = (cart, customerId) =>
  crypto.createHash('sha256').update(JSON.stringify({ cart, customerId: String(customerId) })).digest('hex');

/**
 * Takes the right to create an order for this key. Returns `{ replayUrl }` when the same request already succeeded
 * (answer with that URL), or `{ replayUrl: null }` when the caller should go ahead and create the order.
 */
export async function claimCheckoutAttempt(key, fingerprint) {
  const ownerToken = crypto.randomUUID();
  try {
    await CheckoutAttempt.create({ key, fingerprint, state: 'processing', ownerToken, startedAt: new Date() });
    return { replayUrl: null, ownerToken };
  } catch (error) {
    if (error?.code !== DUPLICATE_KEY_ERROR_CODE) throw error;
  }

  const existing = await CheckoutAttempt.findOne({ key }).lean();
  if (!existing) return claimCheckoutAttempt(key, fingerprint); // it expired a moment ago: try to claim it again

  if (existing.fingerprint !== fingerprint) {
    throw new HttpError(422, 'This checkout was already used for a different basket. Please reload the page and try again.');
  }
  if (existing.state === 'done') {
    const order = await Order.findById(existing.orderId).select('status').lean();
    if (order?.status === 'pending' && existing.checkoutUrl) return { replayUrl: existing.checkoutUrl };
    throw new HttpError(410, 'This checkout is no longer open. Please start a new one.');
  }
  if (existing.state === 'unknown') {
    throw new HttpError(409, 'We could not confirm your last attempt with the payment provider. Please contact us before trying again, so you are not charged twice.');
  }

  // state === 'processing': either another request is working on it right now, or that request crashed.
  const isStale = Date.now() - existing.startedAt.getTime() > STALE_ATTEMPT_AFTER_MS;
  if (isStale) {
    // Conditional on the old startedAt, so only one of several simultaneous retries takes over.
    const takenOver = await CheckoutAttempt.findOneAndUpdate(
      { key, state: 'processing', startedAt: existing.startedAt, ...(existing.ownerToken && { ownerToken: existing.ownerToken }) },
      { $set: { startedAt: new Date(), ownerToken } },
    );
    if (takenOver) return { replayUrl: null, ownerToken };
  }
  throw new HttpError(409, 'Your checkout is already being processed. Please wait a moment.');
}

export const completeCheckoutAttempt = (key, ownerToken, { orderId, checkoutUrl }) =>
  CheckoutAttempt.updateOne(
    { key, state: 'processing', ownerToken },
    { $set: { state: 'done', orderId, checkoutUrl } },
  );

/** The provider may have created the checkout: block automatic retries so the customer is not charged twice. */
export const markCheckoutAttemptUnknown = (key, ownerToken, orderId) =>
  CheckoutAttempt.updateOne(
    { key, state: 'processing', ownerToken },
    { $set: { state: 'unknown', orderId } },
  );

/** The attempt definitely failed, so the same key may try again. */
export const releaseCheckoutAttempt = (key, ownerToken) =>
  CheckoutAttempt.deleteOne({ key, state: 'processing', ownerToken });
