import './helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { query, stub } from './helpers/stub.js';

const { ContactMessage, Order, Product, Setting } = await import('../src/models/index.js');
const { getOverview } = await import('../src/controllers/overview.controller.js');

test('the overview is counted by the database, using the saved low-stock limit', async (t) => {
  stub(t, Setting, { findById: () => query({ lowStockLimit: 5 }) });
  const orderCalls = stub(t, Order, {
    countDocuments: (filter) => Promise.resolve(filter.status === 'paid' ? 4 : filter.status === 'review' ? 2 : 7),
  });
  const productCalls = stub(t, Product, { countDocuments: () => Promise.resolve(3) });
  const messageCalls = stub(t, ContactMessage, { countDocuments: () => Promise.resolve(5) });
  let body;
  await getOverview({}, { json: (value) => { body = value; } });

  assert.deepEqual(body, {
    ordersToShip: 4, ordersInReview: 2, pendingCheckouts: 7, lowStockProducts: 3, unhandledMessages: 5, lowStockLimit: 5,
  });
  assert.equal(orderCalls.countDocuments[0][0].status, 'paid'); // to ship = paid and not yet shipped
  assert.equal(productCalls.countDocuments[0][0].active, true); // hidden products are not "low stock"
  assert.deepEqual(messageCalls.countDocuments[0][0], { handled: false });
});
