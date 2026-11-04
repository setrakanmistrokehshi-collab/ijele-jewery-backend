import { Order, Product } from '../models/index.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';

/** Puts units back on the shelf for a list of `{ product, qty }` lines. Used to undo a half-finished reservation. */
export const restockItems = ({ items }) =>
  Promise.all(items.map((line) => Product.updateOne({ _id: line.product }, { $inc: { stock: line.qty } })));

/**
 * Atomically takes units off the shelf for every line, so two shoppers can never buy the last piece.
 * If any line cannot be fully reserved, everything reserved so far is put back.
 * Returns `{ reserved: true }` or `{ reserved: false, soldOutSku }`.
 */
export async function reserveStock(lines) {
  const reservedLines = [];
  for (const line of lines) {
    const result = await Product.updateOne(
      { _id: line.product, stock: trustedQueryOperator({ $gte: line.qty }) },
      { $inc: { stock: -line.qty } },
    );
    if (!result.modifiedCount) {
      await restockItems({ items: reservedLines });
      return { reserved: false, soldOutSku: line.sku };
    }
    reservedLines.push(line);
  }
  return { reserved: true };
}

/**
 * Returns an order's reserved units to the shelf AT MOST ONCE. The first caller claims the order with an atomic
 * update of `stockReleased`; everyone else (a repeated webhook, the sweeper, an admin) gets `false` and does nothing.
 * Safe to call again after a failure: if nothing was restocked the claim is undone, so the next call retries.
 */
export async function releaseOrderStock(orderId) {
  const claimedOrder = await Order.findOneAndUpdate(
    { _id: orderId, stockReleased: trustedQueryOperator({ $ne: true }) },
    { $set: { stockReleased: true } },
  ).select('orderNumber items').lean();
  if (!claimedOrder) return false;

  const results = await Promise.allSettled(
    claimedOrder.items.map((line) => Product.updateOne({ _id: line.product }, { $inc: { stock: line.qty } })),
  );
  const failures = results.filter((result) => result.status === 'rejected');

  if (failures.length === results.length && failures.length > 0) {
    await Order.updateOne({ _id: orderId }, { $set: { stockReleased: false } });
    throw failures[0].reason;
  }
  if (failures.length > 0) {
    // Some lines went back and some did not. Retrying would double-restock the good ones, so a person must fix it.
    const failedSkus = claimedOrder.items.filter((_, index) => results[index].status === 'rejected').map((line) => line.sku);
    console.error(`PARTIAL RESTOCK for order ${claimedOrder.orderNumber}: adjust stock by hand for ${failedSkus.join(', ')}`);
  }
  return true;
}
