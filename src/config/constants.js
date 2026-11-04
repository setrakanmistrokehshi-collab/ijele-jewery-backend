export const CURRENCIES = ['USD', 'NGN', 'EUR', 'GBP'];
export const PRODUCT_CATEGORIES = ['Watch', 'Chain', 'Necklace'];

export const ORDER_STATUSES = [
  'pending', 'paid', 'expired', 'failed', 'review', 'cancelled', 'refund_pending', 'refunded',
];
/** Orders in these states never had money collected, so an admin may delete them. */
export const DELETABLE_ORDER_STATUSES = ['pending', 'expired', 'failed', 'cancelled'];

export const ORDER_NUMBER_PREFIX = 'AUR';
export const SKU_PATTERN = /^[A-Z0-9-]{3,40}$/;
export const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

/** Every browser write must send this header; a cross-site form or image tag cannot. */
export const CSRF_HEADER_NAME = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'aurora';

export const ADMIN_SESSION_COOKIE = 'adminSessionId';
export const CUSTOMER_SESSION_COOKIE = 'customerSessionId';
export const GOOGLE_NONCE_COOKIE = 'googleNonce';

export const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
export const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

/** Why an order sits in 'review'. */
export const REVIEW_REASONS = {
  paymentUnconfirmed: 'payment-unconfirmed', // Bachs may have created the checkout but we never got its answer
  paymentMismatch: 'payment-mismatch', // wrong currency, wrong amount or underpaid
  latePayment: 'late-payment', // money arrived after the order expired, failed or was cancelled
  refundAmountUnknown: 'refund-amount-unknown', // a refund event without an amount
};
