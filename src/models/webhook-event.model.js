import mongoose from 'mongoose';

const SIX_MONTHS_IN_SECONDS = 180 * 24 * 60 * 60;

// One row per webhook event we received. It makes processing idempotent across retries, restarts and several
// server instances (the unique eventId is the lock), and it is an audit trail of what happened to each event.
const webhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  type: String,
  status: { type: String, enum: ['processing', 'processed', 'failed'], required: true },
  outcome: String, // what the handler did, e.g. 'paid', 'duplicate', 'unmatched'
  error: { type: String, maxlength: 300 },
  attempts: { type: Number, default: 1 },
  startedAt: Date,
  processedAt: Date,
  createdAt: { type: Date, default: Date.now, index: { expireAfterSeconds: SIX_MONTHS_IN_SECONDS } },
});

export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
