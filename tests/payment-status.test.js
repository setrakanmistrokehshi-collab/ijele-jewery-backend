import './helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stub } from './helpers/stub.js';

const { Order } = await import('../src/models/index.js');
const { refreshOrderPaymentStatus } = await import('../src/services/payment-status.service.js');

const pendingOrder = { _id: 'order-1', orderNumber: 'IJL-1234567', status: 'pending', bachsCheckoutId: 'chk_1' };

test('a successful Bachs status check reuses payment settlement with the captured amount and charge', async (t) => {
  const calls = stub(t, Order, { updateOne: async () => ({ modifiedCount: 1 }) });
  let processedEvent;

  const refreshed = await refreshOrderPaymentStatus(pendingOrder, {
    now: 1_000_000,
    getCheckout: async (checkoutId) => {
      assert.equal(checkoutId, 'chk_1');
      return {
        checkout_id: 'chk_1',
        reference: 'order-reference',
        payment_status: 'succeeded',
        amount: '150.00',
        currency: 'USD',
        charge: { payment_id: 'pay_1', amount_paid: '150.00', currency: 'USD' },
      };
    },
    processEvent: async (event) => {
      processedEvent = event;
      return 'paid';
    },
  });

  assert.equal(refreshed, true);
  assert.equal(calls.updateOne.length, 1);
  assert.equal(calls.updateOne[0][0].status, 'pending');
  assert.equal(calls.updateOne[0][0].bachsCheckoutId, 'chk_1');
  assert.equal(calls.updateOne[0][1].$set.lastPaymentStatusCheckAt.getTime(), 1_000_000);
  assert.deepEqual(processedEvent, {
    type: 'collection.succeeded',
    data: {
      checkout_id: 'chk_1',
      reference: 'order-reference',
      amount: '150.00',
      currency: 'USD',
      charge_id: 'pay_1',
    },
  });
});

test('an expired checkout is reconciled, but expiration is not trusted when a charge exists', async (t) => {
  stub(t, Order, { updateOne: async () => ({ modifiedCount: 1 }) });
  const events = [];
  const options = {
    getCheckout: async () => ({
      checkout_id: 'chk_1',
      status: 'expired',
      payment_status: 'expired',
    }),
    processEvent: async (event) => {
      events.push(event);
      return 'expired';
    },
  };

  assert.equal(await refreshOrderPaymentStatus(pendingOrder, options), true);
  assert.equal(events[0].type, 'checkout.expired');

  const withCharge = {
    ...options,
    getCheckout: async () => ({
      checkout_id: 'chk_1',
      status: 'expired',
      payment_status: 'expired',
      charge: { payment_id: 'pay_1' },
    }),
  };
  assert.equal(await refreshOrderPaymentStatus(pendingOrder, withCharge), false);
  assert.equal(events.length, 1);
});

test('a recent payment-status check prevents another provider request', async (t) => {
  const calls = stub(t, Order, { updateOne: async () => ({ modifiedCount: 0 }) });
  let providerCalls = 0;

  const refreshed = await refreshOrderPaymentStatus(pendingOrder, {
    getCheckout: async () => {
      providerCalls += 1;
      return { checkout_id: 'chk_1', payment_status: 'succeeded' };
    },
  });

  assert.equal(refreshed, false);
  assert.equal(calls.updateOne.length, 1);
  assert.equal(providerCalls, 0);
});

test('a provider-confirmed payment can recover payment-check-needed review orders', async (t) => {
  const calls = stub(t, Order, { updateOne: async () => ({ modifiedCount: 1 }) });
  const order = {
    ...pendingOrder,
    status: 'review',
    reviewReason: 'payment-check-needed',
  };
  let processedEvent;

  const refreshed = await refreshOrderPaymentStatus(order, {
    getCheckout: async () => ({
      checkout_id: 'chk_1',
      payment_status: 'succeeded',
      amount: '150.00',
      currency: 'USD',
    }),
    processEvent: async (event) => {
      processedEvent = event;
      return 'paid-after-review';
    },
  });

  assert.equal(refreshed, true);
  assert.equal(calls.updateOne[0][0].status, 'review');
  assert.equal(calls.updateOne[0][0].reviewReason, 'payment-check-needed');
  assert.equal(calls.updateOne[0][2].timestamps, false);
  assert.equal(processedEvent.type, 'collection.succeeded');
});
