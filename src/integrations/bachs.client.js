import {
  Bachs, webhooks, BachsWebhookError, BachsApiError, BachsNetworkError, BachsResponseError,
} from '@bachs/sdk';
import { env } from '../config/env.js';
import { ConcurrencyLimiter } from '../utils/concurrency-limiter.js';
import { OperationTimeoutError, withTimeout } from '../utils/with-timeout.js';

const bachsClient = new Bachs({ apiKey: env.BACHS_API_KEY, environment: env.BACHS_ENV });
export { webhooks as bachsWebhooks, BachsWebhookError };

const BACHS_CALL_TIMEOUT_MS = 10_000;

// Every call to Bachs goes through this limiter, so a rush of shoppers cannot open hundreds of simultaneous
// connections to the provider (or exhaust our own sockets and memory while they wait).
const paymentCallLimiter = new ConcurrencyLimiter({
  maxConcurrent: env.PAYMENT_MAX_CONCURRENT_CALLS,
  maxQueued: env.PAYMENT_MAX_QUEUED_CALLS,
});

/** Creates a hosted checkout, with a hard timeout. A timeout counts as "outcome unknown" (see below). */
export const createBachsCheckoutSession = (parameters, options) =>
  paymentCallLimiter.run(() => withTimeout(bachsClient.checkoutSessions.create(parameters, options), BACHS_CALL_TIMEOUT_MS));

export const getPaymentCallStats = () => paymentCallLimiter.stats;

/**
 * True when Bachs may have created the checkout even though our request failed (timeout, bad response).
 * In that case stock must stay reserved and the order goes to manual review.
 */
export function mayHaveReachedBachs(error) {
  if (error instanceof OperationTimeoutError) return true;
  const isTransportError =
    error instanceof BachsApiError || error instanceof BachsNetworkError || error instanceof BachsResponseError;
  return isTransportError && Boolean(error.outcomeUnknown);
}
