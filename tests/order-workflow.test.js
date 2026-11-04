import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAllowedActions, planOrderAction } from '../src/services/order-workflow.js';

const paidOrder = { status: 'paid', step: 0, carrier: '', trackingNumber: '' };

test('each status only offers the actions that make sense', () => {
  assert.deepEqual(getAllowedActions({ status: 'pending' }), ['cancel']);
  assert.deepEqual(getAllowedActions({ status: 'review' }), ['mark-paid', 'cancel']);
  assert.deepEqual(getAllowedActions({ status: 'refund_pending' }), ['mark-refunded']);
  assert.deepEqual(getAllowedActions({ status: 'refunded' }), []);
  assert.ok(getAllowedActions(paidOrder).includes('refund'));
});

test('shipping an order needs a carrier and a tracking number', () => {
  const plan = planOrderAction(paidOrder, 'shipped', {});
  assert.equal(plan.ok, false);
  const shipped = planOrderAction(paidOrder, 'shipped', { carrier: 'DHL', trackingNumber: '123' });
  assert.equal(shipped.ok, true);
  assert.equal(shipped.notifyCustomer, 'step');
  assert.equal(shipped.changes.step, 2);
});

test('moving an order back a step does not notify the customer', () => {
  const plan = planOrderAction({ ...paidOrder, step: 2, carrier: 'DHL', trackingNumber: '1' }, 'packed', {});
  assert.equal(plan.ok, true);
  assert.equal(plan.notifyCustomer, null);
});

test('marking paid and refunding both require a note', () => {
  assert.equal(planOrderAction({ status: 'review' }, 'mark-paid', {}).ok, false);
  assert.equal(planOrderAction(paidOrder, 'refund', {}).ok, false);
  assert.equal(planOrderAction(paidOrder, 'refund', { note: 'Damaged', restock: true }).shouldRestock, true);
});

test('cancelling restocks, and a reviewed order needs a reason', () => {
  assert.equal(planOrderAction({ status: 'pending' }, 'cancel', {}).shouldRestock, true);
  assert.equal(planOrderAction({ status: 'review' }, 'cancel', {}).ok, false);
});

test('actions not allowed in the current state are refused', () => {
  const plan = planOrderAction({ status: 'refunded' }, 'cancel', {});
  assert.equal(plan.ok, false);
});
