// Run ONCE after deploying the idempotency update, before starting the new server:
//   npm run migrate-stock-flags
//
// Orders that expired, failed or were cancelled before this update already had their stock returned by the old
// code. Marking them `stockReleased: true` guarantees the new safety net never returns that stock a second time.
// Orders still pending are left alone: they really do hold stock, and will release it when they expire.
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Order } from '../src/models/index.js';

await connectDatabase();
const result = await Order.updateMany(
  { status: { $in: ['expired', 'failed', 'cancelled'] }, stockReleased: { $exists: false } },
  { $set: { stockReleased: true } },
);
console.log(`Marked ${result.modifiedCount} older orders as already restocked`);
await disconnectDatabase();
