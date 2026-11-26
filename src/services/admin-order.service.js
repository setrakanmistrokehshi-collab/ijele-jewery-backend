import { Admin, Order } from '../models/index.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';
import { HttpError } from '../utils/http-error.js';
import { getAllowedActions, planOrderAction } from './order-workflow.js';
import { notifyCustomerOfOrderUpdate } from './notification.service.js';
import { releaseOrderStock, reserveStock } from './stock.service.js';

/**
 * Marks a late-paid order as paid AND takes its items off the shelf again, in one transaction. If any item has sold
 * out meanwhile, nothing changes and the admin is told to cancel and refund instead.
 */
async function updateAndReserveStock(order, update) {
  const session = await Order.db.startSession();
  try {
    let updatedOrder;
    await session.withTransaction(async () => {
      updatedOrder = await Order.findOneAndUpdate(
        { _id: order._id, status: order.status, step: order.step, stockReleased: true },
        { ...update, $set: { ...update.$set, stockReleased: false } },
        { new: true, session },
      ).lean();
      if (!updatedOrder) return;
      const reservation = await reserveStock(order.items, session);
      if (!reservation.reserved) {
        throw new HttpError(409, `${reservation.soldOutSku} is out of stock now, so this late payment cannot be fulfilled. Cancel the order and refund the customer.`);
      }
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
    return updatedOrder;
  } finally {
    await session.endSession();
  }
}

/** Applies an admin action (ship, cancel, refund...) to an order and records it in the order's history. */
export async function applyAdminOrderAction({ orderId, adminId, input }) {
  const order = await Order.findById(orderId).lean();
  if (!order) throw new HttpError(404, 'Not found');

  const plan = planOrderAction(order, input.action, input);
  if (!plan.ok) throw new HttpError(409, plan.error);

  const admin = await Admin.findById(adminId).select('email').lean();
  const historyEntry = {
    at: new Date(),
    by: admin?.email ?? 'admin',
    action: input.action,
    from: plan.from,
    to: plan.to,
    note: input.note || undefined,
  };

  // Applies only if the order is still exactly as we planned from, so a double click
  // or a second admin cannot apply the same action twice.
  const update = {
    $set: plan.changes,
    // An admin decision settles whatever put the order in review.
    ...(order.status === 'review' ? { $unset: { reviewReason: '' } } : {}),
    $push: { history: historyEntry },
  };
  const updatedOrder = plan.shouldReserveStock
    ? await updateAndReserveStock(order, update)
    : await Order.findOneAndUpdate({ _id: orderId, status: order.status, step: order.step }, update, { new: true }).lean();
  if (!updatedOrder) throw new HttpError(409, 'This order just changed. Reload and try again.');

  // At most once per order, even if the checkout already expired or the admin clicks twice.
  if (plan.shouldRestock) await releaseOrderStock(orderId).catch((error) => console.error('Restock failed:', error));
  if (plan.notifyCustomer) {
    // Never blocks the admin.
    const description = plan.notifyCustomer === 'refunded' ? 'refunded' : undefined;
    notifyCustomerOfOrderUpdate(updatedOrder, description).catch((error) => console.error(error));
  }
  return { ...updatedOrder, actions: getAllowedActions(updatedOrder) };
}
