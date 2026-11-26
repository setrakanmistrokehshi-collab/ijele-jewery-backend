import './helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stub, query } from './helpers/stub.js';
import { DELETABLE_ORDER_STATUSES } from '../src/config/constants.js';
import { planOrderAction } from '../src/services/order-workflow.js';

const { Order, Product, CheckoutAttempt } = await import('../src/models/index.js');
const { deleteOrder } = await import('../src/controllers/order.controller.js');
const { deleteProduct } = await import('../src/controllers/product.controller.js');
const { claimCheckoutAttempt } = await import('../src/services/checkout-attempt.service.js');
const { createCheckout, MAX_OPEN_CHECKOUTS_PER_CUSTOMER } = await import('../src/services/checkout.service.js');

const fakeResponse = () => {
  const response = { statusCode: 200, body: undefined };
  response.status = (code) => { response.statusCode = code; return response; };
  response.json = (body) => { response.body = body; return response; };
  response.end = () => response;
  return response;
};
const objectId = 'a'.repeat(24);

test('pending orders can no longer be deleted (they hold stock and may still be paid)', () => {
  assert.ok(!DELETABLE_ORDER_STATUSES.includes('pending'));
  assert.deepEqual(DELETABLE_ORDER_STATUSES, ['expired', 'failed', 'cancelled']);
});

test('deleting an order requires its stock to be back on the shelf', async (t) => {
  const calls = stub(t, Order, { deleteOne: () => Promise.resolve({ deletedCount: 0 }) });
  const response = fakeResponse();
  await deleteOrder({ params: { id: objectId } }, response);

  assert.equal(calls.deleteOne[0][0].stockReleased, true);
  assert.equal(response.statusCode, 409);
});

test('marking a late payment as paid takes the stock again; other orders do not', () => {
  const late = planOrderAction({ status: 'review', reviewReason: 'late-payment', stockReleased: true }, 'mark-paid', { note: 'verified' });
  assert.equal(late.ok, true);
  assert.equal(late.shouldReserveStock, true);

  const held = planOrderAction({ status: 'review', reviewReason: 'payment-mismatch', stockReleased: false }, 'mark-paid', { note: 'verified' });
  assert.equal(held.shouldReserveStock, false);
});

test('a product that is on an order is archived, not deleted', async (t) => {
  const calls = stub(t, Product, {
    findByIdAndUpdate: () => Promise.resolve({ _id: objectId, active: false }),
    deleteOne: () => Promise.resolve({ deletedCount: 1 }),
  });
  stub(t, Order, { exists: () => Promise.resolve({ _id: 'o1' }) });
  const response = fakeResponse();
  await deleteProduct({ params: { id: objectId } }, response);

  assert.equal(calls.deleteOne.length, 0);
  assert.deepEqual(calls.findByIdAndUpdate[0][1], { $set: { active: false } });
  assert.equal(response.body.archived, true);
});

test('a product nobody ordered is really deleted', async (t) => {
  const calls = stub(t, Product, { deleteOne: () => Promise.resolve({ deletedCount: 1 }) });
  stub(t, Order, { exists: () => Promise.resolve(null) });
  const response = fakeResponse();
  await deleteProduct({ params: { id: objectId } }, response);

  assert.equal(calls.deleteOne.length, 1);
  assert.equal(response.statusCode, 204);
});

function stubExistingAttempt(t, attempt, order) {
  const duplicate = Object.assign(new Error('duplicate'), { code: 11000 });
  stub(t, CheckoutAttempt, { create: () => Promise.reject(duplicate), findOne: () => query(attempt) });
  stub(t, Order, { findById: () => query(order) });
}
const unknownAttempt = { key: 'k', fingerprint: 'f', state: 'unknown', orderId: 'o1', checkoutUrl: 'https://pay.example/c1' };

test('an unconfirmed attempt tells the customer to wait while the order is still in review', async (t) => {
  stubExistingAttempt(t, unknownAttempt, { status: 'review' });
  await assert.rejects(claimCheckoutAttempt('k', 'f'), { status: 409 });
});

test('an unconfirmed attempt resolves to a fresh start once the sweeper expired the order', async (t) => {
  stubExistingAttempt(t, unknownAttempt, { status: 'expired' });
  await assert.rejects(claimCheckoutAttempt('k', 'f'), { status: 410 });
});

test('an unconfirmed attempt replays the checkout once the sweeper confirmed it', async (t) => {
  stubExistingAttempt(t, unknownAttempt, { status: 'pending' });
  assert.deepEqual(await claimCheckoutAttempt('k', 'f'), { replayUrl: 'https://pay.example/c1' });
});

const cart = {
  currency: 'USD', phone: '+2348012345678',
  address: { name: 'A', line1: 'B', city: 'C', postal: '1' },
  shipping: { country: 'Nigeria', state: '', city: '', method: 'std' },
  items: [{ sku: 'WATCH-1', qty: 1 }],
};
const checkoutRequest = () => createCheckout({
  cart, signedInCustomer: { _id: 'c1', email: 'a@gmail.com' }, idempotencyKey: 'key-1', requestOrigin: 'https://shop.example.com',
});

test('a customer whose open checkouts are all still unconfirmed is refused with a 409, and the attempt is released', async (t) => {
  const attemptCalls = stub(t, CheckoutAttempt, {
    create: () => Promise.resolve({}),
    deleteOne: () => Promise.resolve({ deletedCount: 1 }),
  });
  stub(t, Order, {
    find: () => query([]),
    countDocuments: () => Promise.resolve(MAX_OPEN_CHECKOUTS_PER_CUSTOMER),
  });

  await assert.rejects(checkoutRequest(), { status: 409 });
  assert.equal(attemptCalls.deleteOne.length, 1);
});

test('at the limit, the oldest unpaid checkouts are retired and their stock returned instead of refusing the customer', async (t) => {
  stub(t, CheckoutAttempt, {
    create: () => Promise.resolve({}),
    deleteOne: () => Promise.resolve({ deletedCount: 1 }),
  });
  const orderCalls = stub(t, Order, {
    find: () => query([{ _id: 'old1' }, { _id: 'old2' }, { _id: 'old3' }]), // oldest first
    countDocuments: () => Promise.resolve(0),
    updateOne: () => Promise.resolve({ modifiedCount: 1 }),
    // releaseOrderStock claims the order inside a transaction
    findOneAndUpdate: () => query({ items: [{ product: 'p1', sku: 'WATCH-1', qty: 1 }] }),
  });
  const productCalls = stub(t, Product, { updateOne: () => Promise.resolve({ matchedCount: 1 }) });
  const originalDb = Order.db;
  Order.db = { startSession: async () => ({ withTransaction: (work) => work(), endSession: async () => {} }) };
  t.after(() => { Order.db = originalDb; });

  // The new checkout itself fails later (no products in this stub), which is fine: we only look at the retiring.
  stub(t, Product, { find: () => Promise.resolve([]) });
  await assert.rejects(checkoutRequest());

  assert.equal(orderCalls.updateOne.length, 1); // 3 open + 1 new would be 4: exactly one must go
  assert.deepEqual(orderCalls.updateOne[0][0], { _id: 'old1', status: 'pending' });
  assert.equal(orderCalls.updateOne[0][1].$set.status, 'expired');
  assert.equal(productCalls.updateOne.length, 1);
});
