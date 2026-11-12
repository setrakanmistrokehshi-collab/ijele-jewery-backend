import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { trustedQueryOperator } from '../src/utils/trusted-query-operator.js';
import { resolveClientOrigin } from '../src/utils/client-origin.js';

mongoose.set('sanitizeFilter', true);

const FilterTest = mongoose.model(
  'TrustedQueryOperatorTest',
  new mongoose.Schema({ expiresAt: Date, status: String, customer: mongoose.Schema.Types.ObjectId, email: String }),
);

test('trusted query operators are not rewritten by filter sanitization', () => {
  const expiresAt = new Date();
  const query = FilterTest.find({
    expiresAt: trustedQueryOperator({ $gt: expiresAt }),
    status: trustedQueryOperator({ $in: ['active'] }),
  });

  assert.doesNotThrow(() => query.cast(FilterTest));
  assert.equal(query.getFilter().expiresAt.$gt.getTime(), expiresAt.getTime());
  assert.deepEqual(query.getFilter().status.$in, ['active']);
});

test('trusted $exists filter on an ObjectId field survives sanitization', () => {
  const customerId = new mongoose.Types.ObjectId();
  const query = FilterTest.find({
    $or: [
      { customer: customerId },
      { customer: trustedQueryOperator({ $exists: false }), email: 'customer@example.com' },
    ],
  });

  assert.doesNotThrow(() => query.cast(FilterTest));
  assert.equal(query.getFilter().$or[1].customer.$exists, false);
});

test('checkout return URLs select only a configured storefront origin', () => {
  const configuredOrigins = [
    'http://localhost:5173/',
    'http://127.0.0.1:5173',
    'https://store.example.com',
  ];

  assert.equal(resolveClientOrigin('http://127.0.0.1:5173', configuredOrigins), 'http://127.0.0.1:5173');
  assert.equal(resolveClientOrigin('https://attacker.example', configuredOrigins), 'http://localhost:5173');
  assert.equal(resolveClientOrigin(undefined, configuredOrigins), 'http://localhost:5173');
});
