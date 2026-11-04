import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { trustedQueryOperator } from '../src/utils/trusted-query-operator.js';

mongoose.set('sanitizeFilter', true);

const FilterTest = mongoose.model(
  'TrustedQueryOperatorTest',
  new mongoose.Schema({ expiresAt: Date, status: String }),
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
