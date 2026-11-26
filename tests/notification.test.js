import './helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.ONESIGNAL_APP_ID = 'test-app-id';
process.env.ONESIGNAL_API_KEY = 'test-api-key';

const { notifyCustomerOfOrderUpdate } = await import('../src/services/notification.service.js');

test('order update targets the email address with OneSignal email_to and escaped HTML', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options, payload: JSON.parse(options.body) });
    return { ok: true };
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await notifyCustomerOfOrderUpdate({
    _id: 'order-id',
    orderNumber: 'IJL-123456',
    email: 'customer@example.com',
    step: 0,
    carrier: '<Carrier>',
    trackingNumber: '<track&123>',
  }, 'paid');

  const emailRequest = requests.find(({ payload }) => payload.email_subject);
  assert.ok(emailRequest);
  assert.equal(emailRequest.url, 'https://api.onesignal.com/notifications');
  assert.deepEqual(emailRequest.payload.email_to, ['customer@example.com']);
  assert.equal(emailRequest.payload.email_subject, 'Order IJL-123456 is paid');
  assert.match(emailRequest.payload.email_body, /&lt;Carrier&gt;/);
  assert.match(emailRequest.payload.email_body, /&lt;track&amp;123&gt;/);
  assert.match(emailRequest.payload.email_body, /https:\/\/shop\.example\.com\/orders/);
  assert.equal('include_email_tokens' in emailRequest.payload, false);

  await notifyCustomerOfOrderUpdate({
    orderNumber: 'IJL-123457',
    email: 'customer@example.com',
    step: 2,
    trackingNumber: 'TRACK-123',
  }, 'on its way');

  const trackingOnlyEmail = requests.filter(({ payload }) => payload.email_subject)[1];
  assert.match(trackingOnlyEmail.payload.email_body, /Tracking number: <strong>TRACK-123<\/strong>/);
  assert.doesNotMatch(trackingOnlyEmail.payload.email_body, /undefined/);
});
