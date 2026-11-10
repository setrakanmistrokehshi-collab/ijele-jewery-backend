import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fingerprintCart } from '../src/services/checkout-attempt.service.js';

const cart = { currency: 'USD', items: [{ sku: 'WATCH-1', qty: 1 }] };

test('checkout idempotency fingerprints are stable per customer and differ across customers', () => {
  const firstAttempt = fingerprintCart(cart, 'customer-one');

  assert.equal(fingerprintCart(cart, 'customer-one'), firstAttempt);
  assert.notEqual(fingerprintCart(cart, 'customer-two'), firstAttempt);
});
