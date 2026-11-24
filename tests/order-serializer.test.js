import assert from 'node:assert/strict';
import test from 'node:test';
import { toCustomerOrderView } from '../src/serializers/order.serializer.js';

test('customer order view includes payment status for pending checkouts', () => {
  const view = toCustomerOrderView({
    orderNumber: 'IJL-1234567',
    createdAt: new Date('2026-11-24T12:00:00Z'),
    status: 'pending',
    step: 0,
    currency: 'USD',
    revenue: 5000,
    items: [{ name: 'Pendant', qty: 1 }],
  });

  assert.equal(view.status, 'pending');
});
