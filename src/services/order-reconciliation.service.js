// Background safety net for events that never arrive. Webhooks can be lost (an outage, a misconfigured URL, a
// provider incident); without this, a pending order would hold its stock forever.
import { Order } from '../models/index.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';
import { releaseOrderStock } from './stock.service.js';

const SWEEP_INTERVAL_MS = 2 * 60 * 1000;
// The Bachs checkout lives 30 minutes. The extra time lets webhook retries arrive before we give up on an order.
const ABANDONED_AFTER_MS = 45 * 60 * 1000;
const BATCH_SIZE = 100;

/**
 * 1. Expires pending orders whose checkout is long over, and returns their stock.
 * 2. Finishes any stock release that failed earlier on an expired, failed or cancelled order.
 * Both are conditional and idempotent, so several servers can run this at the same time.
 */
export async function reconcileOrders(now = Date.now()) {
  const cutoff = new Date(now - ABANDONED_AFTER_MS);

  const abandoned = await Order.find({
    status: 'pending',
    createdAt: trustedQueryOperator({ $lt: cutoff }),
  }).select('_id').limit(BATCH_SIZE).lean();
  for (const { _id } of abandoned) {
    const expired = await Order.updateOne(
      { _id, status: 'pending' },
      {
        $set: { status: 'expired' },
        $push: { history: { at: new Date(), by: 'system', action: 'auto-expired', to: 'expired', note: 'No payment confirmation arrived in time' } },
      },
    );
    // If a payment does turn up later, the webhook moves the order to review (see 'late-payment').
    if (expired.modifiedCount) await releaseOrderStock(_id);
  }

  // `stockReleased: false` (explicitly) only matches orders created by this version, never older records.
  const unfinished = await Order.find({
    status: trustedQueryOperator({ $in: ['expired', 'failed', 'cancelled'] }),
    stockReleased: false,
    updatedAt: trustedQueryOperator({ $lt: cutoff }),
  }).select('_id').limit(BATCH_SIZE).lean();
  for (const { _id } of unfinished) await releaseOrderStock(_id);

  return { expired: abandoned.length, retried: unfinished.length };
}

/** Runs reconcileOrders on a timer. Never overlaps itself and never crashes the server. Returns a stop function. */
export function startOrderReconciliation() {
  let isRunning = false;
  const timer = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const result = await reconcileOrders();
      if (result.expired || result.retried) console.log('Order reconciliation:', result);
    } catch (error) {
      console.error('Order reconciliation failed:', error);
    } finally {
      isRunning = false;
    }
  }, SWEEP_INTERVAL_MS);
  timer.unref(); // does not keep the process alive on shutdown
  return () => clearInterval(timer);
}
