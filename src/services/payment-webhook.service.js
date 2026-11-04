import { OBJECT_ID_PATTERN, REVIEW_REASONS } from '../config/constants.js';
import { Order } from '../models/index.js';
import { decimalStringToMinorUnits } from '../utils/money.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';
import { notifyCustomerOfOrderUpdate } from './notification.service.js';
import { releaseOrderStock } from './stock.service.js';

const systemHistoryEntry = (action, to, note) => ({ at: new Date(), by: 'system', action, to, note });

/**
 * Finds the order an event is about. Tries the Bachs checkout id first, then the charge id, then the reference we
 * sent when creating the checkout (our order id). The reference matters when saving the checkout id failed: without
 * it a real payment would belong to "no order" and be lost.
 */
async function findOrderForEvent(eventData, chargeId) {
  if (eventData.checkout_id) {
    const order = await Order.findOne({ bachsCheckoutId: String(eventData.checkout_id) });
    if (order) return order;
  }
  if (chargeId) {
    const order = await Order.findOne({ bachsChargeId: chargeId });
    if (order) return order;
  }
  const reference = eventData.reference ?? eventData.metadata?.orderId;
  if (typeof reference === 'string' && OBJECT_ID_PATTERN.test(reference)) {
    const order = await Order.findById(reference);
    if (order && !order.bachsCheckoutId && eventData.checkout_id) {
      await Order.updateOne(
        { _id: order._id, bachsCheckoutId: trustedQueryOperator({ $exists: false }) },
        { $set: { bachsCheckoutId: String(eventData.checkout_id) } },
      );
    }
    return order;
  }
  return null;
}

/** Money arrived (fully or short). Every update below is conditional on the order's current state. */
async function handleCollection(event, eventData, chargeId) {
  const order = await findOrderForEvent(eventData, chargeId);
  if (!order) return 'unmatched';
  if (order.status === 'paid') return 'duplicate';

  const isExactPayment =
    event.type === 'collection.succeeded' &&
    eventData.currency === order.currency &&
    decimalStringToMinorUnits(eventData.amount) === order.revenue;
  const paymentDetails = { paidAt: new Date(), ...(chargeId && { bachsChargeId: chargeId }) };
  const confirmedEntry = systemHistoryEntry('payment-confirmed', 'paid', 'Confirmed by Bachs');
  const mismatchEntry = systemHistoryEntry('payment-mismatch', 'review', `Bachs reported ${event.type}`);

  // 1. Normal case: pending -> paid. A wrong or short amount goes to review so a person looks at it.
  const fromPending = await Order.updateOne(
    { _id: order._id, status: 'pending' },
    isExactPayment
      ? { $set: { status: 'paid', ...paymentDetails }, $push: { history: confirmedEntry } }
      : { $set: { status: 'review', reviewReason: REVIEW_REASONS.paymentMismatch, ...paymentDetails }, $push: { history: mismatchEntry } },
  );
  if (fromPending.modifiedCount) return isExactPayment ? 'paid' : 'review';

  // 2. We never learned whether Bachs created the checkout, and the money did arrive: settle it.
  const fromUnconfirmed = await Order.updateOne(
    { _id: order._id, status: 'review', reviewReason: REVIEW_REASONS.paymentUnconfirmed },
    isExactPayment
      ? { $set: { status: 'paid', ...paymentDetails }, $unset: { reviewReason: '' }, $push: { history: confirmedEntry } }
      : { $set: { reviewReason: REVIEW_REASONS.paymentMismatch, ...paymentDetails }, $push: { history: mismatchEntry } },
  );
  if (fromUnconfirmed.modifiedCount) return isExactPayment ? 'paid-after-review' : 'review';

  // 3. Money that arrives after the order was cancelled, expired or failed needs a person (its stock was released).
  const lateEntry = systemHistoryEntry('late-payment', 'review', `Payment arrived after the order was ${order.status}`);
  const late = await Order.updateOne(
    { _id: order._id, status: trustedQueryOperator({ $in: ['cancelled', 'expired', 'failed'] }) },
    { $set: { status: 'review', reviewReason: REVIEW_REASONS.latePayment, ...paymentDetails }, $push: { history: lateEntry } },
  );
  if (late.modifiedCount) return 'late-payment';

  // 4. An order already in review for another reason: remember the charge id so a refund can be matched later.
  if (chargeId) {
    const recorded = await Order.updateOne(
      { _id: order._id, status: 'review', bachsChargeId: trustedQueryOperator({ $exists: false }) },
      { $set: paymentDetails, $push: { history: systemHistoryEntry('payment-details-recorded', 'review', 'Charge details received from Bachs') } },
    );
    if (recorded.modifiedCount) return 'review-details-recorded';
  }
  return 'ignored';
}

/**
 * The checkout expired without payment. Releasing stock is idempotent, so it is attempted even when the order is
 * already expired: that is what makes a retry after a failed restock finish the job.
 */
async function handleCheckoutExpired(eventData) {
  const order = await findOrderForEvent(eventData);
  if (!order) return 'unmatched';

  const expiredNow = await Order.updateOne(
    {
      _id: order._id,
      $or: [{ status: 'pending' }, { status: 'review', reviewReason: REVIEW_REASONS.paymentUnconfirmed }],
    },
    {
      $set: { status: 'expired' },
      $unset: { reviewReason: '' },
      $push: { history: systemHistoryEntry('checkout-expired', 'expired', 'The Bachs checkout expired unpaid') },
    },
  );
  if (expiredNow.modifiedCount || order.status === 'expired') {
    await releaseOrderStock(order._id);
    return 'expired';
  }
  return 'ignored';
}

/** Keeps the order in step with refunds made in the Bachs dashboard as well as ones started from our admin. */
async function handleRefund(event, eventData, chargeId) {
  const order = await findOrderForEvent(eventData, chargeId);
  if (!order) return 'unmatched';

  if (event.type === 'refund.failed') {
    const stockNote = order.stockReleased ? ' The items were already returned to stock, so adjust stock by hand.' : '';
    const reverted = await Order.updateOne(
      { _id: order._id, status: 'refund_pending' },
      {
        $set: { status: 'paid' },
        $push: { history: systemHistoryEntry('refund-failed', 'paid', `Bachs reported the refund failed. Try again in the Bachs dashboard.${stockNote}`) },
      },
    );
    return reverted.modifiedCount ? 'refund-failed' : 'ignored';
  }

  if (eventData.amount == null) {
    // Without an amount we cannot tell a full refund from a partial one, so never assume.
    const flagged = await Order.updateOne(
      { _id: order._id, status: trustedQueryOperator({ $in: ['paid', 'refund_pending'] }) },
      {
        $set: { status: 'review', reviewReason: REVIEW_REASONS.refundAmountUnknown },
        $push: { history: systemHistoryEntry('refund-amount-unknown', 'review', 'Bachs confirmed a refund without an amount. Check it in the Bachs dashboard.') },
      },
    );
    return flagged.modifiedCount ? 'review' : 'ignored';
  }

  const isPartialRefund = eventData.currency === order.currency && decimalStringToMinorUnits(eventData.amount) < order.revenue;
  if (isPartialRefund) {
    await Order.updateOne(
      { _id: order._id },
      { $push: { history: systemHistoryEntry('partial-refund', order.status, `Partial refund of ${eventData.amount} ${eventData.currency} confirmed by Bachs`) } },
    );
    return 'partial-refund';
  }

  const refundedOrder = await Order.findOneAndUpdate(
    { _id: order._id, status: trustedQueryOperator({ $in: ['paid', 'refund_pending'] }) },
    {
      $set: {
        status: 'refunded',
        refundedAt: new Date(),
        ...(eventData.refund_id && { refundReference: String(eventData.refund_id) }),
      },
      $push: { history: systemHistoryEntry('refund-paid', 'refunded', 'Confirmed by Bachs') },
    },
    { new: true },
  ).lean();
  if (!refundedOrder) return 'ignored';
  notifyCustomerOfOrderUpdate(refundedOrder, 'refunded').catch((error) => console.error(error));
  return 'refunded';
}

/** Applies one verified Bachs event and returns what happened. Called at most once per event by webhook-event.service. */
export async function processBachsEvent(event) {
  const eventData = event.data ?? {};
  const chargeId = eventData.charge_id ? String(eventData.charge_id) : undefined;

  switch (event.type) {
    case 'collection.succeeded':
    case 'collection.underpaid':
      return handleCollection(event, eventData, chargeId);
    case 'checkout.expired':
      return handleCheckoutExpired(eventData);
    case 'refund.paid':
    case 'refund.failed':
      return handleRefund(event, eventData, chargeId);
    default:
      return 'unhandled-type';
  }
}
