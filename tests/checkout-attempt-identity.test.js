import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CheckoutAttempt, Order } from '../src/models/index.js';
import {
  claimCheckoutAttempt,
  completeCheckoutAttempt,
  fingerprintCart,
} from '../src/services/checkout-attempt.service.js';

const cart = { currency: 'USD', items: [{ sku: 'WATCH-1', qty: 1 }] };

test('checkout idempotency fingerprints are stable per customer and differ across customers', () => {
  const firstAttempt = fingerprintCart(cart, 'customer-one');

  assert.equal(fingerprintCart(cart, 'customer-one'), firstAttempt);
  assert.notEqual(fingerprintCart(cart, 'customer-two'), firstAttempt);
});

test('checkout keys remain unique across all order statuses', () => {
  const checkoutKeyIndex = Order.schema.indexes().find(([keys]) => keys.checkoutAttemptKey === 1);

  assert.ok(checkoutKeyIndex);
  assert.equal(checkoutKeyIndex[1].unique, true);
  assert.deepEqual(checkoutKeyIndex[1].partialFilterExpression, {
    checkoutAttemptKey: { $type: 'string' },
  });
});

test('a stale checkout retry takes ownership using a conditional update', async () => {
  const methods = ['create', 'findOne', 'findOneAndUpdate'];
  const originals = new Map(methods.map((method) => [method, Object.getOwnPropertyDescriptor(CheckoutAttempt, method)]));
  const previousStartedAt = new Date(Date.now() - 3 * 60 * 1000);
  let takeoverFilter;
  let takeoverUpdate;

  try {
    CheckoutAttempt.create = async () => {
      const error = new Error('duplicate key');
      error.code = 11000;
      throw error;
    };
    CheckoutAttempt.findOne = () => ({
      lean: async () => ({
        fingerprint: 'same-cart',
        state: 'processing',
        startedAt: previousStartedAt,
        ownerToken: 'previous-owner',
      }),
    });
    CheckoutAttempt.findOneAndUpdate = async (filter, update) => {
      takeoverFilter = filter;
      takeoverUpdate = update;
      return { _id: 'attempt' };
    };

    const claim = await claimCheckoutAttempt('key', 'same-cart');

    assert.ok(claim.ownerToken);
    assert.notEqual(claim.ownerToken, 'previous-owner');
    assert.deepEqual(takeoverFilter, {
      key: 'key',
      state: 'processing',
      startedAt: previousStartedAt,
      ownerToken: 'previous-owner',
    });
    assert.equal(takeoverUpdate.$set.ownerToken, claim.ownerToken);
  } finally {
    for (const [method, descriptor] of originals) {
      if (descriptor) Object.defineProperty(CheckoutAttempt, method, descriptor);
      else delete CheckoutAttempt[method];
    }
  }
});

test('checkout completion is conditional on the current owner token', async () => {
  const original = Object.getOwnPropertyDescriptor(CheckoutAttempt, 'updateOne');
  let updateFilter;
  try {
    CheckoutAttempt.updateOne = async (filter) => {
      updateFilter = filter;
      return { matchedCount: 0 };
    };

    await completeCheckoutAttempt('key', 'current-owner', {
      orderId: 'order',
      checkoutUrl: 'https://example.test/checkout',
    });

    assert.deepEqual(updateFilter, { key: 'key', state: 'processing', ownerToken: 'current-owner' });
  } finally {
    if (original) Object.defineProperty(CheckoutAttempt, 'updateOne', original);
    else delete CheckoutAttempt.updateOne;
  }
});
