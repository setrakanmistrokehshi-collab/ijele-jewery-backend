import { CUSTOMER_SESSION_COOKIE, GOOGLE_NONCE_COOKIE } from '../config/constants.js';
import { customerSessionCookie, googleNonceCookie, withoutMaxAge } from '../config/cookies.js';
import { env } from '../config/env.js';
import { CheckoutAttempt, Customer, CustomerSession, Order } from '../models/index.js';
import { toCustomerOrderView } from '../serializers/order.serializer.js';
import { toPublicCustomer } from '../serializers/customer.serializer.js';
import { signInCustomer, verifyGoogleSignIn } from '../services/customer-auth.service.js';
import { createPushId } from '../services/notification.service.js';
import { refreshOrderPaymentStatuses } from '../services/payment-status.service.js';
import { generateNonce } from '../utils/nonce.js';
import { hashSessionToken } from '../utils/tokens.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';
import { customerOrderParamsSchema, deleteCustomerSchema, googleSignInSchema } from '../validators/customer.validators.js';

function customerOrdersFilter(customer) {
  const ownership = [{ customer: customer._id }];
  if (customer.trusted && customer.email) ownership.push({ customer: null, email: customer.email });
  return { $or: ownership };
}

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
  const filter = customerOrdersFilter(request.customer);
  let orders = await Order.find(filter).sort({ createdAt: -1 }).limit(50).lean();
  if (await refreshOrderPaymentStatuses(orders)) {
    orders = await Order.find(filter).sort({ createdAt: -1 }).limit(50).lean();
  }
  return response.json({
    pushId: request.customer.trusted ? createPushId(request.customer.email) : undefined,
    orders: orders.map(toCustomerOrderView),
  });
}

export async function requestOrderCancellation(request, response) {
  const { orderNumber } = customerOrderParamsSchema.parse(request.params);
  const ownershipFilter = customerOrdersFilter(request.customer);
  const order = await Order.findOne({ orderNumber, ...ownershipFilter })
    .select('_id status step cancelRequestedAt')
    .lean();
  if (!order) return response.status(404).json({ error: 'Not found' });
  if (order.cancelRequestedAt) return response.status(409).json({ error: 'A cancellation request is already awaiting review.' });
  if (!['pending', 'review', 'paid'].includes(order.status)) {
    return response.status(409).json({ error: 'This order is no longer eligible for a cancellation request.' });
  }
  if ((order.step ?? 0) >= 2) {
    return response.status(409).json({ error: 'Orders marked as shipped or delivered cannot be cancelled online.' });
  }

  const requestedAt = new Date();
  const result = await Order.updateOne(
    {
      _id: order._id,
      status: order.status,
      cancelRequestedAt: trustedQueryOperator({ $exists: false }),
      $or: [
        { step: trustedQueryOperator({ $lt: 2 }) },
        { step: trustedQueryOperator({ $exists: false }) },
      ],
    },
    {
      $set: { cancelRequestedAt: requestedAt },
      $push: {
        history: {
          at: requestedAt,
          by: 'customer',
          action: 'cancel-requested',
          from: order.status,
          to: order.status,
          note: 'Customer requested cancellation; admin review is required.',
        },
      },
    },
  );
  if (!result.modifiedCount) {
    return response.status(409).json({ error: 'The order changed before your request was saved. Refresh and try again.' });
  }
  return response.status(202).json({ ok: true });
}

export async function deleteCurrentCustomer(request, response) {
  deleteCustomerSchema.parse(request.body);

  const session = await Customer.db.startSession();
  try {
    await session.withTransaction(async () => {
      const filter = customerOrdersFilter(request.customer);
      const orders = await Order.find(filter).select('_id').session(session).lean();
      const orderIds = orders.map(({ _id }) => _id);
      if (orderIds.length) {
        await CheckoutAttempt.deleteMany(
          { orderId: trustedQueryOperator({ $in: orderIds }) },
          { session },
        );
        await Order.deleteMany(filter, { session });
      }
      await CustomerSession.deleteMany({ customer: request.customer._id }, { session });
      const deleted = await Customer.deleteOne({ _id: request.customer._id }, { session });
      if (!deleted.deletedCount) throw new HttpError(404, 'Customer account not found.');
    });
  } finally {
    await session.endSession();
  }

  return response
    .clearCookie(CUSTOMER_SESSION_COOKIE, withoutMaxAge(customerSessionCookie))
    .status(204)
    .end();
}
