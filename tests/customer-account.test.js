import './helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { query, stub } from './helpers/stub.js';

const { CheckoutAttempt, Customer, CustomerSession, Order } = await import('../src/models/index.js');
const { deleteCurrentCustomer, requestOrderCancellation } = await import('../src/controllers/customer.controller.js');

function responseStub() {
  const response = { statusCode: 200, body: undefined, clearedCookie: undefined };
  response.status = (code) => { response.statusCode = code; return response; };
  response.json = (body) => { response.body = body; return response; };
  response.clearCookie = (name, options) => { response.clearedCookie = { name, options }; return response; };
  response.end = () => response;
  return response;
}

test('customers can request cancellation before shipment and the request is recorded for admin review', async (t) => {
  const calls = stub(t, Order, {
    findOne: () => query({ _id: 'order-id', status: 'paid', step: 1 }),
    updateOne: () => Promise.resolve({ modifiedCount: 1 }),
  });
  const response = responseStub();

  await requestOrderCancellation({
    params: { orderNumber: 'IJL-123456' },
    customer: { _id: 'customer-id', email: 'customer@example.com', trusted: true },
  }, response);

  assert.equal(response.statusCode, 202);
  assert.equal(response.body.ok, true);
  assert.deepEqual(calls.findOne[0][0].$or, [
    { customer: 'customer-id' },
    { customer: null, email: 'customer@example.com' },
  ]);
  assert.equal(calls.updateOne[0][1].$push.history.action, 'cancel-requested');
});

test('customers cannot request cancellation after an order is marked shipped', async (t) => {
  const calls = stub(t, Order, {
    findOne: () => query({ _id: 'order-id', status: 'paid', step: 2 }),
    updateOne: () => Promise.resolve({ modifiedCount: 1 }),
  });
  const response = responseStub();

  await requestOrderCancellation({
    params: { orderNumber: 'IJL-123456' },
    customer: { _id: 'customer-id', email: 'customer@example.com', trusted: false },
  }, response);

  assert.equal(response.statusCode, 409);
  assert.match(response.body.error, /shipped or delivered/);
  assert.equal(calls.updateOne.length, 0);
});

test('account deletion removes the customer, sessions, associated orders and checkout attempts transactionally', async (t) => {
  const calls = {
    orderFind: stub(t, Order, {
      find: () => query([{ _id: 'order-id' }]),
      deleteMany: () => Promise.resolve({ deletedCount: 1 }),
    }),
    attempts: stub(t, CheckoutAttempt, { deleteMany: () => Promise.resolve({ deletedCount: 1 }) }),
    sessions: stub(t, CustomerSession, { deleteMany: () => Promise.resolve({ deletedCount: 1 }) }),
    customer: stub(t, Customer, { deleteOne: () => Promise.resolve({ deletedCount: 1 }) }),
  };
  const originalDb = Customer.db;
  let transactionRan = false;
  Customer.db = {
    startSession: async () => ({
      withTransaction: async (callback) => { transactionRan = true; await callback(); },
      endSession: async () => {},
    }),
  };
  t.after(() => { Customer.db = originalDb; });
  const response = responseStub();

  await deleteCurrentCustomer({
    body: { confirmation: 'DELETE' },
    customer: { _id: 'customer-id', email: 'customer@example.com', trusted: true },
  }, response);

  assert.equal(transactionRan, true);
  assert.equal(response.statusCode, 204);
  assert.equal(response.clearedCookie.name, 'customerSessionId');
  assert.deepEqual(calls.orderFind.find[0][0].$or, [
    { customer: 'customer-id' },
    { customer: null, email: 'customer@example.com' },
  ]);
  assert.equal(calls.orderFind.deleteMany.length, 1);
  assert.equal(calls.attempts.deleteMany.length, 1);
  assert.equal(calls.sessions.deleteMany.length, 1);
  assert.equal(calls.customer.deleteOne.length, 1);
});
