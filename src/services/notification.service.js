// Order updates use OneSignal for push and Brevo for transactional email.
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import {
  fetchOneSignalSubscriberStats, isOneSignalConfigured, sendOneSignalNotification,
} from '../integrations/onesignal.client.js';
import { isBrevoConfigured, sendBrevoEmail } from '../integrations/brevo.client.js';
import { escapeHtml } from '../utils/escape-html.js';
import { HttpError } from '../utils/http-error.js';

const STEP_DESCRIPTIONS = ['being prepared', 'packed', 'on its way', 'delivered'];
const ORDER_MESSAGES = {
  paid: {
    heading: 'Payment confirmed',
    body: 'We’ve received your payment and are preparing your order. We’ll keep you updated as it moves through delivery.',
  },
  refunded: {
    heading: 'Refund processed',
    body: 'Your order has been refunded. Please allow your payment provider time to return the funds to your original payment method.',
  },
  'being prepared': {
    heading: 'We’re preparing your order',
    body: 'Your order is being carefully prepared. We’ll let you know when it is ready for delivery.',
  },
  packed: {
    heading: 'Your order is packed',
    body: 'Your order has been packed and is getting ready to leave us. We’ll share delivery details as soon as it is on its way.',
  },
  'on its way': {
    heading: 'Your order is on its way',
    body: 'Your order has been handed over for delivery. You can use the tracking details below to follow its progress.',
  },
  delivered: {
    heading: 'Your order has been delivered',
    body: 'Your order has been marked as delivered. We hope you love your new piece from Ijele.',
  },
};

/** Opaque per-customer OneSignal external_id. Only revealed after email and order number are verified. */
export const createPushId = (email) => crypto.createHmac('sha256', env.PUSH_ID_SECRET).update(email).digest('hex');

function buildOrderEmailHtml(order, description) {
  const ordersUrl = `${new URL(env.CLIENT_ORIGIN[0]).origin}/orders`;
  const message = ORDER_MESSAGES[description] ?? {
    heading: 'Your order has been updated',
    body: 'There’s an update to your order. Visit your order page for the latest details.',
  };
  const customerName = order.address?.name?.trim().split(/\s+/)[0];
  const trackingDetails = [
    order.carrier && `Carrier: ${escapeHtml(order.carrier)}`,
    order.trackingNumber && `Tracking number: <strong>${escapeHtml(order.trackingNumber)}</strong>`,
  ].filter(Boolean).join(' · ');
  const trackingLine = trackingDetails
    ? `<div style="background:#f7f4ef;padding:16px;margin:20px 0"><p style="margin:0 0 8px"><strong>Delivery details</strong></p><p style="margin:0">${trackingDetails}</p></div>`
    : '';
  return (
    `<div style="font-family:Arial,sans-serif;color:#29251f;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">` +
    `<p style="font-family:Georgia,serif;font-size:20px;margin:0 0 24px">Ijele Smart Jewelry</p>` +
    `<p>Hello${customerName ? ` ${escapeHtml(customerName)}` : ''},</p>` +
    `<h1 style="font-family:Georgia,serif;font-size:26px;font-weight:400">${escapeHtml(message.heading)}</h1>` +
    `<p>${escapeHtml(message.body)}</p>` +
    `<p><strong>Order number:</strong> ${escapeHtml(order.orderNumber ?? 'Unavailable')}</p>${trackingLine}` +
    `<p style="margin:28px 0"><a href="${ordersUrl}" style="display:inline-block;background:#29251f;color:#fff;text-decoration:none;padding:12px 20px">View your order</a></p>` +
    `<p style="font-size:13px;color:#6b665f">Thank you for choosing Ijele. If you have any questions, please reply to this email.</p>` +
    `<p style="font-size:13px;color:#6b665f">Ijele Smart Jewelry</p></div>`
  );
}

/** Push plus email. Failures are logged and never block fulfilment. */
export async function notifyCustomerOfOrderUpdate(order, description = STEP_DESCRIPTIONS[order.step]) {
  if (!order?.email) {
    console.error(`Order ${order?.orderNumber ?? order?._id ?? 'unknown'} has no email address; notification skipped`);
    return;
  }
  const oneSignalConfigured = isOneSignalConfigured();
  const brevoConfigured = isBrevoConfigured();
  if (!oneSignalConfigured && !brevoConfigured) return;

  const update = description ?? STEP_DESCRIPTIONS[order.step] ?? 'updated';
  const subject = `Order ${order.orderNumber} is ${update}`;
  const sends = [];
  if (oneSignalConfigured) {
    sends.push(sendOneSignalNotification({
      target_channel: 'push',
      include_aliases: { external_id: [createPushId(order.email)] },
      headings: { en: 'Ijele' },
      contents: { en: subject },
      url: `${new URL(env.CLIENT_ORIGIN[0]).origin}/orders`,
    }));
  }
  if (update !== 'packed' && brevoConfigured) {
    sends.push(sendBrevoEmail({
      to: order.email,
      subject,
      htmlContent: buildOrderEmailHtml(order, update),
    }));
  } else if (update !== 'packed' && oneSignalConfigured) {
    sends.push(sendOneSignalNotification({
      email_to: [order.email],
      email_subject: subject,
      email_body: buildOrderEmailHtml(order, update),
    }));
  }

  const results = await Promise.allSettled(sends);
  results
    .filter((result) => result.status === 'rejected')
    .forEach((result) => console.error('Order notification failed:', result.reason?.message ?? result.reason));
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
