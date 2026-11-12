import mongoose from 'mongoose';
import crypto from 'node:crypto';

const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

// The attempt lease coordinates requests; the order's unique checkoutAttemptKey remains the durable duplicate guard
// after this short-lived record expires.
const checkoutAttemptSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  fingerprint: { type: String, required: true }, // hash of the basket, so a key cannot be reused for a different one
  state: { type: String, enum: ['processing', 'done', 'unknown'], required: true },
  ownerToken: { type: String, required: true, default: () => crypto.randomUUID() },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  checkoutUrl: String,
  startedAt: Date,
  createdAt: { type: Date, default: Date.now, index: { expireAfterSeconds: ONE_DAY_IN_SECONDS } },
});

export const CheckoutAttempt = mongoose.model('CheckoutAttempt', checkoutAttemptSchema);
