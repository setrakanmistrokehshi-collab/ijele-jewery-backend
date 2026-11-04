import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { bachsWebhooks, BachsWebhookError } from '../integrations/bachs.client.js';
import { createCheckout } from '../services/checkout.service.js';
import { processBachsEvent } from '../services/payment-webhook.service.js';
import { processWebhookOnce } from '../services/webhook-event.service.js';
import { checkoutRequestSchema } from '../validators/checkout.validators.js';

// The browser makes up one random key per basket. Repeating the request with the same key can never create a second order.
const idempotencyKeySchema = z.uuid();

export async function createCheckoutSession(request, response) {
  const idempotencyKey = idempotencyKeySchema.parse(request.get('idempotency-key'));
  const cart = checkoutRequestSchema.parse(request.body);
  const url = await createCheckout({ cart, signedInCustomer: request.customer, idempotencyKey });
  response.json({ url });
}

/**
 * Mounted BEFORE the JSON parser with express.raw: signature verification needs the exact bytes Bachs sent.
 * Each event is processed once (see webhook-event.service.js); a repeat is acknowledged with 200 and ignored.
 */
export async function handleBachsWebhook(request, response) {
  // express.raw only fills the body for application/json. Anything else is not a Bachs delivery.
  if (!Buffer.isBuffer(request.body)) return response.status(400).send('Invalid content type');
  const rawBody = request.body.toString('utf8');

  let event;
  try {
    event = bachsWebhooks.constructEvent(rawBody, request.headers, env.BACHS_WEBHOOK_SECRET);
  } catch (error) {
    if (error instanceof BachsWebhookError) return response.status(400).send('Invalid signature');
    throw error; // becomes a 5xx so Bachs retries
  }

  // If the payload carries no event id, the hash of the exact bytes identifies redeliveries just as well.
  const eventId = event.id ? String(event.id) : crypto.createHash('sha256').update(rawBody).digest('hex');
  await processWebhookOnce({ eventId, eventType: event.type, handler: () => processBachsEvent(event) });
  return response.sendStatus(200);
}
