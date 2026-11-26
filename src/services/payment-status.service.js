import { REVIEW_REASONS } from '../config/constants.js';
import { getBachsCheckoutSession } from '../integrations/bachs.client.js';
import { Order } from '../models/index.js';
import { MAX_OPEN_CHECKOUTS_PER_CUSTOMER } from './checkout.service.js';
import { processBachsEvent } from './payment-webhook.service.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';

const PAYMENT_STATUS_CHECK_COOLDOWN_MS = 30_000;
const CHECKABLE_REVIEW_REASONS = [REVIEW_REASONS.paymentUnconfirmed, REVIEW_REASONS.paymentCheckNeeded];

function paymentStatusFilter(order) {
  if (order.status === 'pending') return { status: 'pending' };
  if (order.status === 'review' && CHECKABLE_REVIEW_REASONS.includes(order.reviewReason)) {
    return { status: 'review', reviewReason: order.reviewReason };
  }
  return null;
}

/** Applies a status response with the same conditional state transitions used by signed webhook events. */
export async function applyBachsCheckoutStatus(order, checkout, processEvent = processBachsEvent) {
  if (!order || !paymentStatusFilter(order) || !order.bachsCheckoutId) return false;
  if (!checkout || String(checkout.checkout_id) !== String(order.bachsCheckoutId)) {
    console.error('Bachs returned an invalid checkout while refreshing payment status:', String(order.orderNumber ?? order._id));
    return false;
  }

  const eventData = {
    checkout_id: String(checkout.checkout_id),
    reference: checkout.reference ?? String(order._id),
  };

  if (checkout.payment_status === 'succeeded') {
    const charge = checkout.charge;
    eventData.amount = charge?.amount_paid ?? charge?.amount ?? checkout.amount;
    eventData.currency = charge?.currency ?? checkout.currency;
    if (charge?.payment_id) eventData.charge_id = String(charge.payment_id);
    const result = await processEvent({ type: 'collection.succeeded', data: eventData });
    return result !== 'unmatched';
  }

  if (
    (checkout.payment_status === 'expired' || checkout.status === 'expired') &&
    !checkout.charge &&
    !checkout.completed_at
  ) {
    const result = await processEvent({ type: 'checkout.expired', data: eventData });
    return result !== 'unmatched';
  }

  return false;
}

async function claimPaymentStatusCheck(order, now) {
  const cutoff = new Date(now - PAYMENT_STATUS_CHECK_COOLDOWN_MS);
  const stateFilter = paymentStatusFilter(order);
  if (!stateFilter) return false;
  const result = await Order.updateOne(
    {
      _id: order._id,
      ...stateFilter,
      bachsCheckoutId: order.bachsCheckoutId,
      $or: [
        { lastPaymentStatusCheckAt: trustedQueryOperator({ $exists: false }) },
        { lastPaymentStatusCheckAt: trustedQueryOperator({ $lte: cutoff }) },
      ],
    },
    { $set: { lastPaymentStatusCheckAt: new Date(now) } },
    { timestamps: false },
  );
  return result.modifiedCount > 0;
}

/**
 * Refreshes one pending order from Bachs. Successful payments go through the same amount, currency and
 * notification handling as webhook events; provider errors leave the database status unchanged.
 */
export async function refreshOrderPaymentStatus(order, {
  getCheckout = getBachsCheckoutSession,
  processEvent = processBachsEvent,
  now = Date.now(),
} = {}) {
  if (!order || !paymentStatusFilter(order) || !order.bachsCheckoutId) return false;
  if (!(await claimPaymentStatusCheck(order, now))) return false;

  let checkout;
  try {
    checkout = await getCheckout(order.bachsCheckoutId);
  } catch (error) {
    console.error('Could not refresh payment status from Bachs:', String(order.orderNumber ?? order._id), error.message);
    return false;
  }

  return applyBachsCheckoutStatus(order, checkout, processEvent);
}

/** Refreshes a customer's open checkouts before their order list is serialized. */
export async function refreshOrderPaymentStatuses(orders, options = {}) {
  const now = options.now ?? Date.now();
  const cutoff = now - PAYMENT_STATUS_CHECK_COOLDOWN_MS;
  const eligible = orders.filter((order) => {
    if (!paymentStatusFilter(order) || !order.bachsCheckoutId) return false;
    const lastCheckedAt = order.lastPaymentStatusCheckAt
      ? new Date(order.lastPaymentStatusCheckAt).getTime()
      : Number.NaN;
    return !Number.isFinite(lastCheckedAt) || lastCheckedAt <= cutoff;
  }).slice(0, MAX_OPEN_CHECKOUTS_PER_CUSTOMER);

  const refreshed = await Promise.all(eligible.map((order) => refreshOrderPaymentStatus(order, { ...options, now })));
  return refreshed.some(Boolean);
}
