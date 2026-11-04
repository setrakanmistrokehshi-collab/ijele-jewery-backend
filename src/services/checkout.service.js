import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ORDER_NUMBER_PREFIX, REVIEW_REASONS } from '../config/constants.js';
import { Order, Product } from '../models/index.js';
import { createBachsCheckoutSession, mayHaveReachedBachs } from '../integrations/bachs.client.js';
import { HttpError } from '../utils/http-error.js';
import { minorUnitsToDecimalString } from '../utils/money.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';
import { MAX_QUANTITY_PER_ITEM } from '../validators/checkout.validators.js';
import {
  claimCheckoutAttempt, completeCheckoutAttempt, fingerprintCart, markCheckoutAttemptUnknown, releaseCheckoutAttempt,
} from './checkout-attempt.service.js';
import { resolveShippingFee } from './shipping.service.js';
import { releaseOrderStock, reserveStock, restockItems } from './stock.service.js';

const CHECKOUT_LIFETIME_MINUTES = 30;
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

/** Order numbers are random, so two orders can (rarely) draw the same one. The unique index catches it; draw again. */
async function createOrderWithUniqueNumber(orderFields) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await Order.create({ ...orderFields, orderNumber: newOrderNumber() });
    } catch (error) {
      const isNumberCollision = error?.code === DUPLICATE_KEY_ERROR_CODE && error.keyPattern?.orderNumber;
      if (!isNumberCollision || attempt >= MAX_ORDER_NUMBER_ATTEMPTS) throw error;
    }
  }
}

/** Creates the order, reserving stock first. If anything fails after reserving, the stock is put back. */
async function createOrderWithReservedStock({ lines, currency, email, phone, address, shipping }) {
  const reservation = await reserveStock(lines);
  if (!reservation.reserved) throw new HttpError(409, `Insufficient stock for ${reservation.soldOutSku}`);

  try {
    const goodsTotal = sumLines(lines, 'unitAmount');
    // Location-based, computed server-side. The browser's own estimate is never trusted.
    const { fee: shippingFee } = await resolveShippingFee({ ...shipping, currency, goodsTotal });
    const revenue = goodsTotal + shippingFee; // shipping is charged to the customer
    const operatingExpenses = sumLines(lines, 'unitCost');

    return await createOrderWithUniqueNumber({
      email, phone, address,
      shipping: { ...shipping, fee: shippingFee },
      items: lines,
      currency,
      revenue,
      operatingExpenses,
      netProfit: revenue - operatingExpenses,
    });
  } catch (error) {
    await restockItems({ items: lines });
    throw error;
  }
}

/** Opens the hosted Bachs checkout for an order and returns its URL. */
async function startHostedCheckout(order) {
  try {
    const session = await createBachsCheckoutSession(
      {
        pricing: { currency: order.currency, amount: minorUnitsToDecimalString(order.revenue) },
        reference: String(order._id),
        metadata: { orderId: String(order._id) },
        expires_in_minutes: CHECKOUT_LIFETIME_MINUTES,
        success_url: `${env.CLIENT_ORIGIN}/thanks`,
        cancel_url: `${env.CLIENT_ORIGIN}/checkout`, // back to the form, with the basket and details still there
      },
      { idempotencyKey: `checkout-${order._id}` },
    );
    // From here the checkout exists at Bachs, so nothing below may fail the order. If saving the id fails,
    // the webhook still finds the order through its reference.
    await Order.updateOne({ _id: order._id }, { $set: { bachsCheckoutId: session.checkout_id } })
      .catch((error) => console.error('Could not save the Bachs checkout id:', error));
    return session.checkout_url;
  } catch (error) {
    console.error('Bachs checkout creation failed:', error.name, error.status, error.errorCode, error.requestId);
    const outcomeUnknown = mayHaveReachedBachs(error);

    if (outcomeUnknown) {
      // The checkout may exist at Bachs: keep the stock held. If a payment arrives, the webhook finds this
      // order by its reference and completes it; if the checkout expires, the order is expired and restocked.
      await Order.updateOne({ _id: order._id }, { $set: { status: 'review', reviewReason: REVIEW_REASONS.paymentUnconfirmed } });
    } else {
      await Order.updateOne({ _id: order._id }, { $set: { status: 'failed' } });
      await releaseOrderStock(order._id);
    }

    // "Very busy" is already a clear, safe message; anything else is reported as a payment-provider problem.
    const reported = error instanceof HttpError ? error : new HttpError(502, 'Payment provider unavailable');
    reported.outcomeUnknown = outcomeUnknown;
    throw reported;
  }
}

/**
 * Returns the hosted checkout URL for a validated cart.
 * Safe to repeat: the same `idempotencyKey` and basket never create a second order.
 */
export async function createCheckout({ cart, signedInCustomer, idempotencyKey }) {
  const claim = await claimCheckoutAttempt(idempotencyKey, fingerprintCart(cart));
  if (claim.replayUrl) return claim.replayUrl;

  const { currency, items, email: submittedEmail, phone, address, shipping } = cart;
  // A signed-in customer's order is tied to the verified Google email, not whatever was typed.
  const email = signedInCustomer?.trusted ? signedInCustomer.email : submittedEmail;
  let order = null;

  try {
    const lines = await buildOrderLines(items, currency);
    order = await createOrderWithReservedStock({ lines, currency, email, phone, address, shipping });
    const checkoutUrl = await startHostedCheckout(order);
    // If recording success fails, the customer still gets their checkout link.
    await completeCheckoutAttempt(idempotencyKey, { orderId: order._id, checkoutUrl })
      .catch((error) => console.error('Could not record checkout attempt:', error));
    return checkoutUrl;
  } catch (error) {
    const bookkeeping = error.outcomeUnknown && order
      ? markCheckoutAttemptUnknown(idempotencyKey, order._id)
      : releaseCheckoutAttempt(idempotencyKey);
    await bookkeeping.catch((bookkeepingError) => console.error('Could not update checkout attempt:', bookkeepingError));
    throw error;
  }
}
