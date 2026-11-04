import { DELETABLE_ORDER_STATUSES } from '../config/constants.js';
import { Order } from '../models/index.js';
import { toCustomerOrderView } from '../serializers/order.serializer.js';
import { applyAdminOrderAction } from '../services/admin-order.service.js';
import { createPushId } from '../services/notification.service.js';
import { getAllowedActions } from '../services/order-workflow.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';
import {
  adminOrderActionSchema, orderIdParams, orderLookupSchema,
} from '../validators/order.validators.js';

// ---- Customer-facing (guest lookups need BOTH an order number and its email; every miss is the same 404) ----
export async function trackOrder(request, response) {
  const { orderNumber, email } = orderLookupSchema.parse(request.body);
  const order = await Order.findOne({ orderNumber, email, status: 'paid' }).lean();
  if (!order) return response.status(404).json({ error: 'Not found' });
  return response.json({ ...toCustomerOrderView(order), pushId: createPushId(email) });
}

/** Proving ownership of one order unlocks that email's paid orders. (A magic-link login would be stronger.) */
export async function listOrdersForGuest(request, response) {
  const { orderNumber, email } = orderLookupSchema.parse(request.body);
  const ownsOrder = await Order.exists({ orderNumber, email, status: 'paid' });
  if (!ownsOrder) return response.status(404).json({ error: 'Not found' });

  const orders = await Order.find({ email, status: 'paid' }).sort({ createdAt: -1 }).limit(50).lean();
  return response.json({ pushId: createPushId(email), orders: orders.map(toCustomerOrderView) });
}

// ---- Admin ----
/** `actions` tells the dashboard which buttons to offer, so the rules live in one place (order-workflow.js). */
export async function listOrdersForAdmin(_request, response) {
  const orders = await Order.find().sort({ createdAt: -1 }).limit(200).lean();
  response.json(orders.map((order) => ({ ...order, actions: getAllowedActions(order) })));
}

/** Dashboard totals per currency, all in integer minor units. */
export async function getOrderStats(_request, response) {
  const stats = await Order.aggregate([
    { $match: { status: 'paid' } },
    {
      $group: {
        _id: '$currency',
        orders: { $sum: 1 },
        revenue: { $sum: '$revenue' },
        expenses: { $sum: '$operatingExpenses' },
        net: { $sum: '$netProfit' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  response.json(stats);
}

/** Paid, refunded and refund-pending orders are financial records and can never be deleted. */
export async function deleteOrder(request, response) {
  const { id } = orderIdParams.parse(request.params);
  const result = await Order.deleteOne({
    _id: id,
    status: trustedQueryOperator({ $in: DELETABLE_ORDER_STATUSES }),
  });
  return result.deletedCount
    ? response.status(204).end()
    : response.status(409).json({ error: 'Only pending, expired, failed or cancelled orders can be deleted' });
}

export async function runOrderAction(request, response) {
  const { id } = orderIdParams.parse(request.params);
  const input = adminOrderActionSchema.parse(request.body);
  const order = await applyAdminOrderAction({ orderId: id, adminId: request.adminId, input });
  response.json(order);
}
