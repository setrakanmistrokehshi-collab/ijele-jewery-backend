import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireCustomer } from '../src/middleware/attach-customer.js';

function responseDouble() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('requireCustomer rejects requests without an authenticated customer', () => {
  const response = responseDouble();
  let continued = false;

  requireCustomer({}, response, () => { continued = true; });

  assert.equal(continued, false);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Signed out' });
});

test('requireCustomer allows requests with a server-attached customer', () => {
  const response = responseDouble();
  let continued = false;

  requireCustomer({ customer: { _id: 'customer-id' } }, response, () => { continued = true; });

  assert.equal(continued, true);
  assert.equal(response.statusCode, null);
});
