import './helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.ONESIGNAL_APP_ID = 'test-app-id';
process.env.ONESIGNAL_API_KEY = 'test-api-key';
process.env.BREVO_API_KEY = 'test-brevo-api-key';
process.env.BREVO_SENDER_EMAIL = 'orders@example.com';
process.env.BREVO_SENDER_NAME = 'Ijele Test';

const { notifyCustomerOfOrderUpdate } = await import('../src/services/notification.service.js');
const { env } = await import('../src/config/env.js');

test('order updates send email through Brevo and push through OneSignal', async (t) => {
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
    address: { name: '<Ada Obi>' },
    carrier: '<Carrier>',
    trackingNumber: '<track&123>',
  }, 'paid');

  const emailRequest = requests.find(({ url }) => url === 'https://api.brevo.com/v3/smtp/email');
  assert.ok(emailRequest);
  assert.equal(emailRequest.options.headers['api-key'], 'test-brevo-api-key');
  assert.deepEqual(emailRequest.payload.sender, { email: 'orders@example.com', name: 'Ijele Test' });
  assert.deepEqual(emailRequest.payload.to, [{ email: 'customer@example.com' }]);
  assert.equal(emailRequest.payload.subject, 'Order IJL-123456 is paid');
  assert.match(emailRequest.payload.htmlContent, /Hello &lt;Ada/);
  assert.match(emailRequest.payload.htmlContent, /Payment confirmed/);
  assert.match(emailRequest.payload.htmlContent, /We’ve received your payment and are preparing your order/);
  assert.match(emailRequest.payload.htmlContent, /Order number:<\/strong> IJL-123456/);
  assert.match(emailRequest.payload.htmlContent, /&lt;Carrier&gt;/);
  assert.match(emailRequest.payload.htmlContent, /&lt;track&amp;123&gt;/);
  assert.match(emailRequest.payload.htmlContent, /Thank you for choosing Ijele/);
  assert.match(emailRequest.payload.htmlContent, /https:\/\/shop\.example\.com\/orders/);
  assert.equal(requests.filter(({ url }) => url === 'https://api.onesignal.com/notifications').length, 1);
  const pushRequest = requests.find(({ url }) => url === 'https://api.onesignal.com/notifications');
  assert.equal(pushRequest.payload.target_channel, 'push');
  assert.equal(pushRequest.payload.include_aliases.external_id.length, 1);

  await notifyCustomerOfOrderUpdate({
    orderNumber: 'IJL-123457',
    email: 'customer@example.com',
    step: 2,
    trackingNumber: 'TRACK-123',
  }, 'on its way');

  const trackingOnlyEmail = requests.filter(({ url }) => url === 'https://api.brevo.com/v3/smtp/email')[1];
  assert.match(trackingOnlyEmail.payload.htmlContent, /Tracking number: <strong>TRACK-123<\/strong>/);
  assert.doesNotMatch(trackingOnlyEmail.payload.htmlContent, /undefined/);

  await notifyCustomerOfOrderUpdate({
    orderNumber: 'IJL-123460',
    email: 'customer@example.com',
    step: 1,
  }, 'packed');
  assert.equal(requests.filter(({ url }) => url === 'https://api.brevo.com/v3/smtp/email').length, 2);
  const packedPush = requests.filter(({ url }) => url === 'https://api.onesignal.com/notifications')[2];
  assert.equal(packedPush.payload.contents.en, 'Order IJL-123460 is packed');
});

test('falls back to OneSignal email when Brevo is not configured', async (t) => {
  const originalFetch = globalThis.fetch;
  const brevoApiKey = env.BREVO_API_KEY;
  const requests = [];
  env.BREVO_API_KEY = undefined;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options, payload: JSON.parse(options.body) });
    return { ok: true };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    env.BREVO_API_KEY = brevoApiKey;
  });

  await notifyCustomerOfOrderUpdate({
    orderNumber: 'IJL-123458',
    email: 'customer@example.com',
    step: 2,
  }, 'on its way');

  assert.equal(requests.length, 2);
  assert.ok(requests.some(({ payload }) => payload.email_to?.[0] === 'customer@example.com'));
  assert.ok(requests.every(({ url }) => url === 'https://api.onesignal.com/notifications'));
});

test('Brevo email still sends when OneSignal is unavailable', async (t) => {
  const originalFetch = globalThis.fetch;
  const oneSignalAppId = env.ONESIGNAL_APP_ID;
  const oneSignalApiKey = env.ONESIGNAL_API_KEY;
  const requests = [];
  env.ONESIGNAL_APP_ID = undefined;
  env.ONESIGNAL_API_KEY = undefined;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options, payload: JSON.parse(options.body) });
    return { ok: true };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    env.ONESIGNAL_APP_ID = oneSignalAppId;
    env.ONESIGNAL_API_KEY = oneSignalApiKey;
  });

  await notifyCustomerOfOrderUpdate({
    orderNumber: 'IJL-123459',
    email: 'customer@example.com',
    step: 0,
  }, 'paid');

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.brevo.com/v3/smtp/email');
});
