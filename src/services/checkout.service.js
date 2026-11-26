import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ORDER_NUMBER_PREFIX, REVIEW_REASONS } from '../config/constants.js';
import { Order, Product } from '../models/index.js';
import { createBachsCheckoutSession, mayHaveReachedBachs } from '../integrations/bachs.client.js';
import { HttpError } from '../utils/http-error.js';
import { minorUnitsToDecimalString } from '../utils/money.js';
import { resolveClientOrigin } from '../utils/client-origin.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';
import { MAX_QUANTITY_PER_ITEM } from '../validators/checkout.validators.js';
import {
  claimCheckoutAttempt, completeCheckoutAttempt, fingerprintCart, markCheckoutAttemptUnknown, releaseCheckoutAttempt,
  resolveUnknownCheckoutAttempt,
} from './checkout-attempt.service.js';
import { resolveShippingFee } from './shipping.service.js';
import { releaseOrderStock, reserveStock } from './stock.service.js';

const CHECKOUT_LIFETIME_MINUTES = 30;
/** Stock is held while a checkout is open, so one customer may only hold a few at a time (inventory-parking guard). */
export const MAX_OPEN_CHECKOUTS_PER_CUSTOMER = 3;
const MAX_ORDER_NUMBER_ATTEMPTS = 5;
const DUPLICATE_KEY_ERROR_CODE = 11000;

/** The same SKU listed twice becomes one line with the quantities added together. */
function mergeDuplicateSkus(items) {
  const quantityBySku = new Map();
  for (const { sku, qty } of items) quantityBySku.set(sku, (quantityBySku.get(sku) ?? 0) + qty);
  return [...quantityBySku].map(([sku, qty]) => ({ sku, qty }));
}

/**
 * Turns the customer's basket into order lines. Prices and costs come ONLY from MongoDB;
 * any price sent by the browser is never read.
 */
async function buildOrderLines(items, currency) {
  const requestedItems = mergeDuplicateSkus(items);
  const products = await Product.find({
    sku: trustedQueryOperator({ $in: requestedItems.map((item) => item.sku) }),
    active: true,
  });

  const lines = requestedItems.map(({ sku, qty }) => {
    const product = products.find((candidate) => candidate.sku === sku);
    const isAvailable = product && product.prices[currency] && qty <= MAX_QUANTITY_PER_ITEM;
    if (!isAvailable) return null;
    return {
      product: product._id,
      sku,
      name: product.name,
      qty,
      unitAmount: product.prices[currency],
      unitCost: product.costs[currency],
      gift: product.freeGift?.enabled ? product.freeGift.name : undefined,
    };
  });

  if (lines.includes(null)) throw new HttpError(422, 'An item is unavailable in this currency');
  return lines;
}

const sumLines = (lines, unitField) => lines.reduce((total, line) => total + line[unitField] * line.qty, 0);
const newOrderNumber = () => `${ORDER_NUMBER_PREFIX}-${crypto.randomInt(1_000_000, 10_000_000)}`;

/** Creates the order and reserves every line in one transaction. */
async function createOrderWithReservedStock({
  lines, currency, customer, email, phone, address, shipping, checkoutAttemptKey, clientOrigin,
}) {
  const goodsTotal = sumLines(lines, 'unitAmount');
  // Location-based, computed server-side. The browser's own estimate is never trusted.
  const { fee: shippingFee } = await resolveShippingFee({ ...shipping, currency, goodsTotal });
  const revenue = goodsTotal + shippingFee;
  const operatingExpenses = sumLines(lines, 'unitCost');
  const orderFields = {
    checkoutAttemptKey, clientOrigin,
    customer, email, phone, address,
    shipping: { ...shipping, fee: shippingFee },
    items: lines,
    currency,
    revenue,
    operatingExpenses,
    netProfit: revenue - operatingExpenses,
  };

  for (let attempt = 1; attempt <= MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    const session = await Order.db.startSession();
    try {
      let order;
      await session.withTransaction(async () => {
        const reservation = await reserveStock(lines, session);
        if (!reservation.reserved) throw new HttpError(409, `Insufficient stock for ${reservation.soldOutSku}`);
        [order] = await Order.create([{ ...orderFields, orderNumber: newOrderNumber() }], { session });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
      return order;
    } catch (error) {
      if (error?.code === DUPLICATE_KEY_ERROR_CODE && error.keyPattern?.checkoutAttemptKey) {
        const existingOrder = await Order.findOne({ checkoutAttemptKey }).lean();
        if (existingOrder?.status === 'pending') return existingOrder;
        if (existingOrder?.status === 'review') {
          const conflict = new HttpError(409, 'This payment is being reviewed. Please contact support before trying again.');
          if (existingOrder.reviewReason === REVIEW_REASONS.paymentUnconfirmed) {
            conflict.outcomeUnknown = true;
            conflict.orderId = existingOrder._id;
          }
          throw conflict;
        }
        if (existingOrder) throw new HttpError(410, 'This checkout has already been completed or closed. Start a new checkout.');
      }

      const isNumberCollision = error?.code === DUPLICATE_KEY_ERROR_CODE && error.keyPattern?.orderNumber;
      if (!isNumberCollision || attempt === MAX_ORDER_NUMBER_ATTEMPTS) throw error;
    } finally {
      await session.endSession();
    }
  }
}

/** The exact request sent to Bachs for an order. Identical on a retry, so Bachs' idempotency key can replay it. */
const buildCheckoutParameters = (order, clientOrigin) => ({
  pricing: { currency: order.currency, amount: minorUnitsToDecimalString(order.revenue) },
  reference: String(order._id),
  metadata: { orderId: String(order._id) },
  expires_in_minutes: CHECKOUT_LIFETIME_MINUTES,
  success_url: `${clientOrigin}/thanks`,
  cancel_url: `${clientOrigin}/checkout`, // back to the form, with the basket and details still there
});
const checkoutIdempotencyKey = (order) => ({ idempotencyKey: `checkout-${order._id}` });

/**
 * Settles an order stuck in review/payment-unconfirmed by repeating the checkout creation with the SAME idempotency
 * key: Bachs either replays the checkout it already made or makes it now. Returns 'resumed', 'skipped' or 'failed'.
 */
export async function resumeUnconfirmedCheckout(order) {
  if (!order.clientOrigin) return 'skipped';
  try {
    const session = await createBachsCheckoutSession(
      buildCheckoutParameters(order, order.clientOrigin),
      checkoutIdempotencyKey(order),
    );
    const resumed = await Order.updateOne(
      { _id: order._id, status: 'review', reviewReason: REVIEW_REASONS.paymentUnconfirmed },
      {
        $set: { status: 'pending', bachsCheckoutId: session.checkout_id, checkoutUrl: session.checkout_url },
        $unset: { reviewReason: '' },
        $push: { history: { at: new Date(), by: 'system', action: 'checkout-resumed', from: 'review', to: 'pending', note: 'Checkout confirmed with Bachs on retry' } },
      },
    );
    if (!resumed.modifiedCount) return 'skipped'; // a webhook settled it first
    if (order.checkoutAttemptKey) {
      await resolveUnknownCheckoutAttempt(order.checkoutAttemptKey, { orderId: order._id, checkoutUrl: session.checkout_url })
        .catch((error) => console.error('Could not update checkout attempt:', error));
    }
    return 'resumed';
  } catch (error) {
    console.error('Could not resume checkout for order', String(order._id), error.message);
    return 'failed';
  }
}

/** Opens the hosted Bachs checkout for an order and returns its URL. */
async function startHostedCheckout(order, clientOrigin) {
  try {
    const session = await createBachsCheckoutSession(
      buildCheckoutParameters(order, clientOrigin),
      checkoutIdempotencyKey(order),
    );
    // From here the checkout exists at Bachs, so nothing below may fail the order. If saving the id fails,
    // the webhook still finds the order through its reference.
    await Order.updateOne(
      { _id: order._id },
      { $set: { bachsCheckoutId: session.checkout_id, checkoutUrl: session.checkout_url } },
    )
      .catch((error) => console.error('Could not save the Bachs checkout id:', error));
    return session.checkout_url;
  } catch (error) {
    const outcomeUnknown = mayHaveReachedBachs(error);
    console.error('Bachs checkout creation failed:', {
      name: error.name,
      status: error.status ?? error.responseStatus,
      errorCode: error.errorCode,
      requestId: error.requestId,
      // Bachs' own explanation (e.g. "API key missing required scope"); it never contains our key.
      message: error.message,
      detail: error.body?.detail,
      outcomeUnknown,
    });

    if (outcomeUnknown) {
      // The checkout may exist at Bachs: keep the stock held. If a payment arrives, the webhook finds this
      // order by its reference and completes it; if the checkout expires, the order is expired and restocked.
      await Order.updateOne({ _id: order._id }, { $set: { status: 'review', reviewReason: REVIEW_REASONS.paymentUnconfirmed } });
    } else {
      await Order.updateOne(
        { _id: order._id },
        { $set: { status: 'failed' }, $unset: { checkoutAttemptKey: '' } },
      );
      await releaseOrderStock(order._id);
    }

    // "Very busy" is already a clear, safe message; anything else is reported as a payment-provider problem.
    const reported = error instanceof HttpError ? error : new HttpError(502, 'Payment provider unavailable');
    reported.outcomeUnknown = outcomeUnknown;
    throw reported;
  }
}

/** A customer who already holds several unpaid checkouts must finish or wait for them before opening another. */
async function assertCustomerHasRoomForCheckout(customerId) {
  const openCheckouts = await Order.countDocuments({
    customer: customerId,
    $or: [{ status: 'pending' }, { status: 'review', reviewReason: REVIEW_REASONS.paymentUnconfirmed }],
  });
  if (openCheckouts >= MAX_OPEN_CHECKOUTS_PER_CUSTOMER) {
    throw new HttpError(429, 'You have several unpaid checkouts open. Please complete one, or wait a few minutes for them to expire.');
  }
}

/**
 * Returns the hosted checkout URL for a validated cart.
 * Safe to repeat: the same customer, `idempotencyKey` and basket never create a second order.
 */
export async function createCheckout({ cart, signedInCustomer, idempotencyKey, requestOrigin }) {
  if (!signedInCustomer?._id || !signedInCustomer.email) {
    throw new HttpError(401, 'Sign in with Google to continue checkout');
  }
  const clientOrigin = resolveClientOrigin(requestOrigin, env.CLIENT_ORIGIN);
  if (!clientOrigin) {
    throw new HttpError(503, 'Checkout is unavailable because no public HTTPS return URL is configured');
  }
  const claim = await claimCheckoutAttempt(idempotencyKey, fingerprintCart(cart, signedInCustomer._id));
  if (claim.replayUrl) return claim.replayUrl;

  const { currency, items, phone, address, shipping } = cart;
  const customer = signedInCustomer._id;
  const email = signedInCustomer.email;
  let order = null;

  try {
    await assertCustomerHasRoomForCheckout(customer);
    const lines = await buildOrderLines(items, currency);
    order = await createOrderWithReservedStock({
      lines, currency, customer, email, phone, address, shipping, checkoutAttemptKey: idempotencyKey, clientOrigin,
    });
    const checkoutUrl = await startHostedCheckout(order, clientOrigin);
    // If recording success fails, the customer still gets their checkout link.
    const completed = await completeCheckoutAttempt(idempotencyKey, claim.ownerToken, { orderId: order._id, checkoutUrl })
      .catch((error) => {
        console.error('Could not record checkout attempt:', error);
        return null;
      });
    if (completed && !completed.modifiedCount) {
      console.warn('Checkout attempt ownership changed before completion:', String(order._id));
    }
    return checkoutUrl;
  } catch (error) {
    const uncertainOrderId = order?._id ?? error.orderId;
    const bookkeeping = error.outcomeUnknown && uncertainOrderId
      ? markCheckoutAttemptUnknown(idempotencyKey, claim.ownerToken, uncertainOrderId)
      : releaseCheckoutAttempt(idempotencyKey, claim.ownerToken);
    await bookkeeping.catch((bookkeepingError) => console.error('Could not update checkout attempt:', bookkeepingError));
    throw error;
  }
}
