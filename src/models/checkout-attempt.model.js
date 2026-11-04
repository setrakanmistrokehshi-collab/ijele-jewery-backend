import mongoose from 'mongoose';

const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

// Makes "create checkout" idempotent. The browser sends an Idempotency-Key; the unique `key` index guarantees that
// only one request at a time can create the order for it, and a repeat gets the same hosted-checkout URL back.
const checkoutAttemptSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  fingerprint: { type: String, required: true }, // hash of the basket, so a key cannot be reused for a different one
  state: { type: String, enum: ['processing', 'done', 'unknown'], required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  checkoutUrl: String,
  startedAt: Date,
  createdAt: { type: Date, default: Date.now, index: { expireAfterSeconds: ONE_DAY_IN_SECONDS } },
});

export const CheckoutAttempt = mongoose.model('CheckoutAttempt', checkoutAttemptSchema);
