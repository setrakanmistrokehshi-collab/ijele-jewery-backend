// Fires many checkouts at once against a RUNNING API and reports how it coped.
//
//   BASE_URL=http://localhost:4000 SKU=ROYAL-001 CONCURRENCY=50 REQUESTS=200 npm run load-test
//
// Use a test database and the Bachs SANDBOX: every accepted request creates a real order and a sandbox checkout.
// Healthy results: only 200 (accepted), 409 (sold out or in progress), 429 (rate limited) and 503 (busy, with
// Retry-After). Any 500 or connection error is a problem. Stock must never go below zero (check in the admin).
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000';
const SKU = process.env.SKU;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 50);
const REQUESTS = Number(process.env.REQUESTS ?? 200);
if (!SKU) throw new Error('Set SKU to a product code that exists and has stock');

const basket = () => ({
  currency: 'USD',
  email: 'loadtest@example.com',
  phone: '+2348012345678',
  address: { name: 'Load Test', line1: '1 Test Street', city: 'Lagos', postal: '100001' },
  shipping: { country: 'Nigeria', state: 'Lagos', city: 'Lagos', method: 'std' },
  items: [{ sku: SKU, qty: 1 }],
});

const statusCounts = {};
const durations = [];
let sent = 0;

async function oneRequest() {
  const startedAt = performance.now();
  let label;
  try {
    const response = await fetch(`${BASE_URL}/api/checkout/create-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'aurora', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(basket()),
      signal: AbortSignal.timeout(40_000),
    });
    label = String(response.status);
  } catch (error) {
    label = `error:${error.name}`;
  }
  statusCounts[label] = (statusCounts[label] ?? 0) + 1;
  durations.push(performance.now() - startedAt);
}

async function worker() {
  while (sent < REQUESTS) {
    sent += 1;
    await oneRequest();
  }
}

const testStartedAt = performance.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const seconds = (performance.now() - testStartedAt) / 1000;

durations.sort((a, b) => a - b);
const percentile = (fraction) => Math.round(durations[Math.min(durations.length - 1, Math.floor(durations.length * fraction))]);
console.log(`${REQUESTS} requests, ${CONCURRENCY} at a time, ${seconds.toFixed(1)} s (${(REQUESTS / seconds).toFixed(1)} req/s)`);
console.log('Status codes:', statusCounts);
console.log(`Latency ms: median ${percentile(0.5)}, p95 ${percentile(0.95)}, max ${Math.round(durations.at(-1))}`);
const serverErrors = Object.entries(statusCounts).filter(([label]) => label.startsWith('5') && label !== '503' || label.startsWith('error'));
if (serverErrors.length) {
  console.error('PROBLEM: unexpected failures:', Object.fromEntries(serverErrors));
  process.exitCode = 1;
}
