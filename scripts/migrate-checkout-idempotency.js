// Run with checkout traffic paused before deploying the idempotency index change:
//   npm run migrate-checkout-idempotency
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Order } from '../src/models/index.js';

await connectDatabase({ autoIndex: false });
try {
  const duplicates = await Order.aggregate([
    { $match: { checkoutAttemptKey: { $type: 'string' } } },
    { $group: { _id: '$checkoutAttemptKey', orderIds: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 },
  ]).allowDiskUse(true);
  if (duplicates.length) {
    throw new Error(`Duplicate checkout keys must be resolved before migration: ${JSON.stringify(duplicates)}`);
  }

  const indexName = 'checkoutAttemptKey_1';
  const indexes = await Order.collection.indexes();
  if (indexes.some((index) => index.name === indexName)) {
    await Order.collection.dropIndex(indexName);
  }
  await Order.collection.createIndex(
    { checkoutAttemptKey: 1 },
    {
      name: indexName,
      unique: true,
      partialFilterExpression: { checkoutAttemptKey: { $type: 'string' } },
    },
  );
  console.log('Created the unique checkout-attempt key index');
} finally {
  await disconnectDatabase();
}
