import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideForExistingEvent } from '../src/utils/webhook-claim.js';

const NOW = 1_000_000;
const LEASE = 120_000;
const event = (status, startedAgoMs = 0) => ({ status, startedAt: new Date(NOW - startedAgoMs) });

test('a processed event is acknowledged and skipped', () => {
  assert.equal(decideForExistingEvent(event('processed'), NOW, LEASE), 'skip');
});

test('a failed event is taken over so the retry can finish it', () => {
  assert.equal(decideForExistingEvent(event('failed'), NOW, LEASE), 'take-over');
});

test('an event being processed right now makes the sender retry later', () => {
  assert.equal(decideForExistingEvent(event('processing', 5_000), NOW, LEASE), 'busy');
});

test('an event whose worker crashed (lease expired) is taken over', () => {
  assert.equal(decideForExistingEvent(event('processing', LEASE + 1), NOW, LEASE), 'take-over');
});
