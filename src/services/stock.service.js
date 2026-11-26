import { Order, Product } from '../models/index.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';

/**
 * Atomically takes units off the shelf for every line, so two shoppers can never buy the last piece.
 * The caller must run this inside the same transaction that persists the order. A failed reservation
 * throws from that transaction, rolling back every stock decrement.
 * Returns `{ reserved: true }` or `{ reserved: false, soldOutSku }`.
 */
export async function reserveStock(lines, session) {
  for (const line of lines) {
    const result = await Product.updateOne(
      { _id: line.product, stock: trustedQueryOperator({ $gte: line.qty }) },
      { $inc: { stock: -line.qty } },
      { session },
    );
    if (!result.modifiedCount) return { reserved: false, soldOutSku: line.sku };
  }
  return { reserved: true };
}

/**
 * Returns an order's reserved units to the shelf at most once. The stock increments and stockReleased marker
 * commit in one transaction, so process failure cannot persist only one side of the operation.
 */
export async function releaseOrderStock(orderId) {
  const session = await Order.db.startSession();
  try {
    let released = false;
    await session.withTransaction(async () => {
      const claimedOrder = await Order.findOneAndUpdate(
        { _id: orderId, stockReleased: trustedQueryOperator({ $ne: true }) },
        { $set: { stockReleased: true } },
        { returnDocument: 'after', session },
      ).select('items').lean();
      if (!claimedOrder) return;

      for (const line of claimedOrder.items) {
        const result = await Product.updateOne(
          { _id: line.product },
          { $inc: { stock: line.qty } },
          { session },
        );
        // A deleted product has no shelf to return to. Skip it so the other lines of the order are still restocked
        // (otherwise the whole release rolls back and is retried, and fails, forever).
        if (!result.matchedCount) console.warn(`Skipped restock of deleted product ${line.sku} for order ${orderId}`);
      }
      released = true;
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
    return released;
  } finally {
    await session.endSession();
  }
}
