// Background safety net for events that never arrive. Webhooks can be lost (an outage, a misconfigured URL, a
// provider incident); without this, an unpaid order would hold its stock forever, and a paid one could be expired.
import { REVIEW_REASONS } from '../config/constants.js';
import { getBachsCheckoutSession } from '../integrations/bachs.client.js';
import { Order } from '../models/index.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';
import { resumeUnconfirmedCheckout } from './checkout.service.js';
import { releaseOrderStock } from './stock.service.js';

const MINUTE = 60 * 1000;
const SWEEP_INTERVAL_MS = 2 * MINUTE;
// The Bachs checkout lives 30 minutes. The extra time lets webhook retries arrive before we give up on an order.
const ABANDONED_AFTER_MS = 45 * MINUTE;
// An order whose checkout creation was never confirmed gets its checkout re-created (same idempotency key) only while
// it is young, so a resumed checkout (30 minutes) still ends before ABANDONED_AFTER_MS.
const RESUME_WINDOW_MS = 15 * MINUTE;
const RESUME_AFTER_MS = 1 * MINUTE; // give the original request's webhook a moment first
const BATCH_SIZE = 100;
const RESUME_BATCH_SIZE = 20;

const systemEntry = (action, from, to, note) => ({ at: new Date(), by: 'system', action, from, to, note });

/**
 * True when Bachs shows the customer did something payable on this checkout (a charge, a completion time, or any
 * payment status other than "nothing happened"). Such an order must never be expired automatically.
 */
export function showsPaymentActivity(checkout) {
  if (!checkout) return false;
  if (checkout.charge || checkout.completed_at) return true;
  const idleStatuses = [undefined, null, '', 'created', 'expired', 'cancelled', 'failed'];
  return !idleStatuses.includes(checkout.payment_status);
}

/** Pending orders past their checkout's life: ask Bachs first, so a paid order whose webhook got lost is not expired. */
async function expireAbandonedPending(cutoff, getCheckout) {
  const abandoned = await Order.find({
    status: 'pending',
    createdAt: trustedQueryOperator({ $lt: cutoff }),
  }).select('_id bachsCheckoutId').limit(BATCH_SIZE).lean();

  let expiredCount = 0;
  for (const { _id, bachsCheckoutId } of abandoned) {
    if (bachsCheckoutId) {
      let checkout;
      try {
        checkout = await getCheckout(bachsCheckoutId);
      } catch (error) {
        console.error('Could not check checkout with Bachs; order left as is until the next sweep:', String(_id), error.message);
        continue; // never expire an order we could not verify
      }
      if (showsPaymentActivity(checkout)) {
        await Order.updateOne(
          { _id, status: 'pending' },
          {
            $set: { status: 'review', reviewReason: REVIEW_REASONS.paymentCheckNeeded },
            $push: { history: systemEntry('payment-check-needed', 'pending', 'review', `Bachs shows payment activity (${checkout.payment_status ?? 'charge present'}) but no confirmation arrived. Verify it in the Bachs dashboard, then mark paid or cancel.`) },
          },
        );
        continue;
      }
    }

    const expired = await Order.updateOne(
      { _id, status: 'pending' },
      {
        $set: { status: 'expired' },
        $push: { history: systemEntry('auto-expired', 'pending', 'expired', 'No payment confirmation arrived in time') },
      },
    );
    // If a payment does turn up later, the webhook moves the order to review (see 'late-payment').
    if (expired.modifiedCount) {
      expiredCount += 1;
      await releaseOrderStock(_id);
    }
  }
  return expiredCount;
}

/**
 * Orders stuck in review/payment-unconfirmed (Bachs may or may not have created the checkout):
 *  - while young: repeat the creation with the same idempotency key, which settles the doubt either way;
 *  - once old: the checkout cannot be open any more, so expire the order and return its stock. If money did arrive,
 *    its webhook lands as 'late-payment' and a person decides.
 */
async function settleUnconfirmedOrders(now, cutoff) {
  const resumable = await Order.find({
    status: 'review',
    reviewReason: REVIEW_REASONS.paymentUnconfirmed,
    createdAt: trustedQueryOperator({ $gt: new Date(now - RESUME_WINDOW_MS) }),
    updatedAt: trustedQueryOperator({ $lt: new Date(now - RESUME_AFTER_MS) }),
  }).limit(RESUME_BATCH_SIZE).lean();
  let resumed = 0;
  for (const order of resumable) {
    if (await resumeUnconfirmedCheckout(order) === 'resumed') resumed += 1;
  }

  const stale = await Order.find({
    status: 'review',
    reviewReason: REVIEW_REASONS.paymentUnconfirmed,
    createdAt: trustedQueryOperator({ $lt: cutoff }),
  }).select('_id').limit(BATCH_SIZE).lean();
  let expired = 0;
  for (const { _id } of stale) {
    const result = await Order.updateOne(
      { _id, status: 'review', reviewReason: REVIEW_REASONS.paymentUnconfirmed },
      {
        $set: { status: 'expired' },
        $unset: { reviewReason: '' },
        $push: { history: systemEntry('auto-expired', 'review', 'expired', 'Checkout creation was never confirmed and the checkout window is over') },
      },
    );
    if (result.modifiedCount) {
      expired += 1;
      await releaseOrderStock(_id);
    }
  }
  return { resumed, expired };
}

/**
 * 1. Expires pending orders whose checkout is long over (after asking Bachs), and returns their stock.
 * 2. Resumes or expires orders whose checkout creation was never confirmed.
 * 3. Finishes any stock release that failed earlier on an expired, failed or cancelled order.
 * All are conditional and idempotent, so several servers can run this at the same time.
 */
export async function reconcileOrders(now = Date.now(), { getCheckout = getBachsCheckoutSession } = {}) {
  const cutoff = new Date(now - ABANDONED_AFTER_MS);

  const expired = await expireAbandonedPending(cutoff, getCheckout);
  const unconfirmed = await settleUnconfirmedOrders(now, cutoff);

  // `stockReleased: false` (explicitly) only matches orders created by this version, never older records.
  const unfinished = await Order.find({
    status: trustedQueryOperator({ $in: ['expired', 'failed', 'cancelled'] }),
    stockReleased: false,
    updatedAt: trustedQueryOperator({ $lt: cutoff }),
  }).select('_id').limit(BATCH_SIZE).lean();
  for (const { _id } of unfinished) await releaseOrderStock(_id);

  return { expired, resumed: unconfirmed.resumed, expiredUnconfirmed: unconfirmed.expired, retried: unfinished.length };
}

/** Runs reconcileOrders on a timer. Never overlaps itself and never crashes the server. Returns a stop function. */
export function startOrderReconciliation() {
  let isRunning = false;
  const timer = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const result = await reconcileOrders();
      if (Object.values(result).some(Boolean)) console.log('Order reconciliation:', result);
    } catch (error) {
      console.error('Order reconciliation failed:', error);
    } finally {
      isRunning = false;
    }
  }, SWEEP_INTERVAL_MS);
  timer.unref(); // does not keep the process alive on shutdown
  return () => clearInterval(timer);
}
