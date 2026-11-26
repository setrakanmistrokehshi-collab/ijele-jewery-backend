import './helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stub, query } from './helpers/stub.js';

const { Order } = await import('../src/models/index.js');
const { reconcileOrders, showsPaymentActivity } = await import('../src/services/order-reconciliation.service.js');

test('payment activity on a Bachs checkout is recognised, idle checkouts are not', () => {
  assert.equal(showsPaymentActivity(null), false);
  assert.equal(showsPaymentActivity({ status: 'open', payment_status: null }), false);
  assert.equal(showsPaymentActivity({ status: 'expired', payment_status: 'expired' }), false);
  assert.equal(showsPaymentActivity({ payment_status: 'created' }), false);
  assert.equal(showsPaymentActivity({ payment_status: 'succeeded' }), true);
  assert.equal(showsPaymentActivity({ payment_status: 'underpaid' }), true);
  assert.equal(showsPaymentActivity({ payment_status: null, charge: { payment_id: 'x' } }), true);
  assert.equal(showsPaymentActivity({ completed_at: '2026-11-25T10:00:00Z' }), true);
});

function stubOrders(t, pendingOrders) {
  return stub(t, Order, {
    find: (filter) => query(filter.status === 'pending' ? pendingOrders : []),
    updateOne: () => Promise.resolve({ modifiedCount: 1 }),
  });
}

test('a pending order that Bachs shows as paid is sent to review, never expired', async (t) => {
  const calls = stubOrders(t, [{ _id: 'o1', bachsCheckoutId: 'chk_1' }]);
  await reconcileOrders(Date.now(), { getCheckout: async () => ({ payment_status: 'succeeded' }) });

  assert.equal(calls.updateOne.length, 1);
  const [filter, update] = calls.updateOne[0];
  assert.deepEqual(filter, { _id: 'o1', status: 'pending' });
  assert.equal(update.$set.status, 'review');
  assert.equal(update.$set.reviewReason, 'payment-check-needed');
});

test('a pending order is left alone when Bachs cannot be reached', async (t) => {
  const calls = stubOrders(t, [{ _id: 'o1', bachsCheckoutId: 'chk_1' }]);
  const originalError = console.error;
  console.error = () => {};
  t.after(() => { console.error = originalError; });

  const result = await reconcileOrders(Date.now(), { getCheckout: async () => { throw new Error('network down'); } });

  assert.equal(calls.updateOne.length, 0);
  assert.equal(result.expired, 0);
});
