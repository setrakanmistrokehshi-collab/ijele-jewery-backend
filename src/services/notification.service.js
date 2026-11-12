// Order notifications through OneSignal: web push (by external_id) and a tracking email.
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import {
  fetchOneSignalSubscriberStats, isOneSignalConfigured, sendOneSignalNotification,
} from '../integrations/onesignal.client.js';
import { escapeHtml } from '../utils/escape-html.js';
import { HttpError } from '../utils/http-error.js';

const STEP_DESCRIPTIONS = ['being prepared', 'packed', 'on its way', 'delivered'];

/** Opaque per-customer OneSignal external_id. Only revealed after email and order number are verified. */
export const createPushId = (email) => crypto.createHmac('sha256', env.PUSH_ID_SECRET).update(email).digest('hex');

function buildOrderEmailHtml(order, subject) {
  const ordersUrl = `${new URL(env.CLIENT_ORIGIN[0]).origin}/orders`;
  const trackingLine = order.trackingNumber
    ? `<p>${escapeHtml(order.carrier)} tracking number: <strong>${escapeHtml(order.trackingNumber)}</strong></p>`
    : '';
  return (
    `<div style="font-family:Georgia,serif;max-width:520px"><h2>${escapeHtml(subject)}</h2>${trackingLine}` +
    `<p><a href="${ordersUrl}">View your order status</a></p><p>Aurora Fine Jewelry</p></div>`
  );
}

/** Push plus email. Failures are logged and never block fulfilment. */
export async function notifyCustomerOfOrderUpdate(order, description = STEP_DESCRIPTIONS[order.step]) {
  if (!isOneSignalConfigured()) return;
  const subject = `Order ${order.orderNumber} is ${description}`;
  const results = await Promise.allSettled([
    sendOneSignalNotification({
      target_channel: 'push',
      include_aliases: { external_id: [createPushId(order.email)] },
      headings: { en: 'Aurora' },
      contents: { en: subject },
      url: `${new URL(env.CLIENT_ORIGIN[0]).origin}/orders`,
    }),
    sendOneSignalNotification({
      target_channel: 'email',
      include_email_tokens: [order.email],
      email_subject: subject,
      email_body: buildOrderEmailHtml(order, subject),
    }),
  ]);
  results
    .filter((result) => result.status === 'rejected')
    .forEach((result) => console.error('Order notification failed:', result.reason.message));
}

/** Manual push to every subscriber (flash sales, restock alerts). */
export async function broadcastPush({ title, body, url }) {
  if (!isOneSignalConfigured()) throw new HttpError(503, 'Push notifications are not configured');
  await sendOneSignalNotification({
    target_channel: 'push',
    included_segments: ['Subscribed Users'],
    headings: { en: title },
    contents: { en: body },
    ...(url && { url }),
  });
}

export async function getSubscriberStats() {
  if (!isOneSignalConfigured()) return {};
  return (await fetchOneSignalSubscriberStats()) ?? {};
}
