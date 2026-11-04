import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConcurrencyLimiter } from '../src/utils/concurrency-limiter.js';
import { OperationTimeoutError, withTimeout } from '../src/utils/with-timeout.js';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('never runs more than maxConcurrent tasks at once, and every task finishes', async () => {
  const limiter = new ConcurrencyLimiter({ maxConcurrent: 3, maxQueued: 100 });
  let running = 0;
  let peak = 0;
  const task = async () => {
    running += 1;
    peak = Math.max(peak, running);
    await sleep(5);
    running -= 1;
    return 'done';
  };
  const results = await Promise.all(Array.from({ length: 40 }, () => limiter.run(task)));
  assert.equal(results.length, 40);
  assert.ok(results.every((result) => result === 'done'));
  assert.equal(peak, 3);
  assert.deepEqual(limiter.stats, { active: 0, queued: 0 });
});

test('refuses new work with a 503 once the queue is full', async () => {
  const limiter = new ConcurrencyLimiter({ maxConcurrent: 1, maxQueued: 1 });
  const slow = () => sleep(30);
  const first = limiter.run(slow); // running
  const second = limiter.run(slow); // waiting
  await assert.rejects(limiter.run(slow), (error) => error.status === 503 && error.retryAfterSeconds > 0);
  await Promise.all([first, second]);
});

test('a task that throws still frees its slot', async () => {
  const limiter = new ConcurrencyLimiter({ maxConcurrent: 1, maxQueued: 5 });
  await assert.rejects(limiter.run(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await limiter.run(async () => 'ok'), 'ok');
  assert.deepEqual(limiter.stats, { active: 0, queued: 0 });
});

test('withTimeout rejects slow work and passes fast work through', async () => {
  await assert.rejects(withTimeout(sleep(50), 5), OperationTimeoutError);
  assert.equal(await withTimeout(Promise.resolve(7), 50), 7);
});
