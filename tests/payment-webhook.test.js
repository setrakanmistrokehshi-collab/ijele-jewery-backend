import './helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stub } from './helpers/stub.js';

const { Order } = await import('../src/models/index.js');
const { processBachsEvent } = await import('../src/services/payment-webhook.service.js');

const silence = (t) => {
  const original = console.error;
  console.error = () => {};
  t.after(() => { console.error = original; });
};

test('a different charge on an already paid order is flagged as a double payment', async (t) => {
  silence(t);
  const calls = stub(t, Order, {
    findOne: () => Promise.resolve({ _id: 'o1', status: 'paid', currency: 'NGN', revenue: 13750000, bachsChargeId: 'ch_1' }),
    updateOne: () => Promise.resolve({ modifiedCount: 1 }),
  });
  const outcome = await processBachsEvent({
    type: 'collection.succeeded',
    data: { checkout_id: 'chk_1', charge_id: 'ch_2', amount: '137500.00', currency: 'NGN' },
  });

  assert.equal(outcome, 'duplicate-charge');
  assert.equal(calls.updateOne.length, 1);
});

test('a redelivery of the SAME charge on a paid order stays a quiet duplicate', async (t) => {
  const calls = stub(t, Order, {
    findOne: () => Promise.resolve({ _id: 'o1', status: 'paid', currency: 'NGN', revenue: 13750000, bachsChargeId: 'ch_1' }),
    updateOne: () => Promise.resolve({ modifiedCount: 1 }),
  });
  const outcome = await processBachsEvent({
    type: 'collection.succeeded',
    data: { checkout_id: 'chk_1', charge_id: 'ch_1', amount: '137500.00', currency: 'NGN' },
  });

  assert.equal(outcome, 'duplicate');
  assert.equal(calls.updateOne.length, 0);
});

test('a refund in another currency is sent to review instead of being assumed full', async (t) => {
  const calls = stub(t, Order, {
    findOne: () => Promise.resolve({ _id: 'o1', status: 'paid', currency: 'NGN', revenue: 13750000 }),
    updateOne: () => Promise.resolve({ modifiedCount: 1 }),
    findOneAndUpdate: () => ({ lean: () => Promise.resolve(null) }),
  });
  const outcome = await processBachsEvent({
    type: 'refund.paid',
    data: { checkout_id: 'chk_1', amount: '5.00', currency: 'USD' },
  });

  assert.equal(outcome, 'review');
  assert.equal(calls.findOneAndUpdate?.length ?? 0, 0);
  assert.equal(calls.updateOne[0][1].$set.reviewReason, 'refund-amount-unknown');
});

test('a payment webhook settles an order that was waiting for a payment check', async (t) => {
  const calls = stub(t, Order, {
    findOne: () => Promise.resolve({ _id: 'o1', status: 'review', currency: 'NGN', revenue: 13750000 }),
    updateOne: (filter) => Promise.resolve({ modifiedCount: filter.status === 'review' ? 1 : 0 }),
  });
  const outcome = await processBachsEvent({
    type: 'collection.succeeded',
    data: { checkout_id: 'chk_1', charge_id: 'ch_1', amount: '137500.00', currency: 'NGN' },
  });

  assert.equal(outcome, 'paid-after-review');
  const settleFilter = calls.updateOne.find(([filter]) => filter.status === 'review')[0];
  assert.ok(settleFilter.reviewReason);
});
