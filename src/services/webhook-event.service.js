// Exactly-once-effect processing of webhook events. Bachs may deliver the same event several times, at the same
// moment, to different servers. The unique eventId in MongoDB decides who processes it.
import { WebhookEvent } from '../models/index.js';
import { HttpError } from '../utils/http-error.js';
import { decideForExistingEvent } from '../utils/webhook-claim.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

async function claimEvent(eventId, eventType) {
  try {
    await WebhookEvent.create({ eventId, type: eventType, status: 'processing', startedAt: new Date() });
    return 'process';
  } catch (error) {
    if (error?.code !== DUPLICATE_KEY_ERROR_CODE) throw error;
  }

  const existing = await WebhookEvent.findOne({ eventId }).lean();
  if (!existing) return claimEvent(eventId, eventType); // expired a moment ago: claim it again

  const decision = decideForExistingEvent(existing);
  if (decision !== 'take-over') return decision;

  // Conditional on what we just read, so only one of several simultaneous retries takes over.
  const takenOver = await WebhookEvent.findOneAndUpdate(
    { eventId, status: existing.status, startedAt: existing.startedAt },
    { $set: { status: 'processing', startedAt: new Date() }, $inc: { attempts: 1 } },
  );
  return takenOver ? 'process' : 'busy';
}

/**
 * Runs `handler` once per event. Returns the handler's outcome, or 'duplicate' when the event was already done.
 * A failure is recorded and rethrown, so the sender gets a 5xx and retries.
 */
export async function processWebhookOnce({ eventId, eventType, handler }) {
  const claim = await claimEvent(eventId, eventType);
  if (claim === 'skip') return 'duplicate';
  if (claim === 'busy') throw new HttpError(503, 'Event is being processed', { retryAfterSeconds: 5 });

  try {
    const outcome = (await handler()) ?? 'handled';
    await WebhookEvent.updateOne({ eventId }, { $set: { status: 'processed', outcome, processedAt: new Date() } });
    if (outcome === 'unmatched') {
      console.error(`UNMATCHED WEBHOOK: event ${eventId} (${eventType}) does not belong to any order. Check it in the Bachs dashboard.`);
    }
    return outcome;
  } catch (error) {
    await WebhookEvent.updateOne(
      { eventId },
      { $set: { status: 'failed', error: String(error?.message ?? error).slice(0, 300) } },
    ).catch((logError) => console.error('Could not record webhook failure:', logError));
    throw error;
  }
}
