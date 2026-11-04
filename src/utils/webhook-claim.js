export const PROCESSING_LEASE_MS = 2 * 60 * 1000; // an event "processing" for longer than this is presumed to have crashed

/**
 * Pure decision about a webhook event we have seen before.
 *  - 'skip'      already processed: acknowledge and do nothing
 *  - 'take-over' failed earlier, or its worker crashed: process it again
 *  - 'busy'      another worker is on it right now: ask the sender to retry later
 */
export function decideForExistingEvent(existing, now = Date.now(), leaseMs = PROCESSING_LEASE_MS) {
  if (existing.status === 'processed') return 'skip';
  if (existing.status === 'failed') return 'take-over';
  const isLeaseExpired = now - existing.startedAt.getTime() > leaseMs;
  return isLeaseExpired ? 'take-over' : 'busy';
}
