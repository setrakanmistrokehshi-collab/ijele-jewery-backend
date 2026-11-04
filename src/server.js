import cookieParser from 'cookie-parser';
import express from 'express';
import { handleBachsWebhook } from './controllers/checkout.controller.js';
import { attachCustomer } from './middleware/attach-customer.js';
import { cors } from './middleware/cors.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { noStore } from './middleware/no-store.js';
import { globalLimiter, webhookLimiter } from './middleware/rate-limiters.js';
import { securityHeaders } from './middleware/security-headers.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { startOrderReconciliation } from './services/order-reconciliation.service.js';

const NO_STORE_PATHS = ['/api/auth', '/api/admin', '/api/user', '/api/orders', '/api/checkout', '/api/contact'];

const jsonBodyLimits = [
  { paths: ['/api/admin/products', '/api/admin/messages', '/api/admin/orders'], limit: '24kb' },
  { paths: ['/api/admin/shipping', '/api/admin/notifications', '/api/admin/media'], limit: '8kb' },
  { paths: ['/api/checkout', '/api/orders', '/api/contact', '/api/user'], limit: '16kb' },
];
const DEFAULT_JSON_LIMIT = '8kb';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(cors);

app.post(
  '/api/checkout/webhook',
  noStore,
  webhookLimiter,
  express.raw({ type: 'application/json', limit: '1mb' }),
  handleBachsWebhook,
);

app.use(globalLimiter);
app.use(NO_STORE_PATHS, noStore);

for (const { paths, limit } of jsonBodyLimits) app.use(paths, express.json({ limit }));
app.use(express.json({ limit: DEFAULT_JSON_LIMIT }));
app.use(cookieParser());
app.use(attachCustomer);

app.use('/api', apiRouter);
app.get('/healthz', (_request, response) => response.json({ ok: true }));

app.use('/api', notFoundHandler);
app.use(errorHandler);

await connectDatabase();

// CORS is a browser rule: curl and scripts ignore it, and a client that reaches this port directly can forge
// X-Forwarded-For to dodge the per-IP rate limits. If the API is public, let only your reverse proxy reach it
// (firewall or private networking), or set HOST=127.0.0.1 when both run on one machine.
const server = app.listen(env.PORT, env.HOST, () => console.log(`API listening on ${env.HOST}:${env.PORT}`));

// Slow or stalled connections must not pile up and hold memory during a rush.
server.headersTimeout = 20_000; // time allowed to send the request headers
server.requestTimeout = 30_000; // time allowed to send the whole request
server.keepAliveTimeout = 65_000; // longer than a typical proxy's idle timeout (60 s), to avoid dropped requests

const stopReconciliation = startOrderReconciliation();

if (env.NODE_ENV === 'production' && env.BACHS_ENV === 'sandbox') {
  console.warn('WARNING: production mode with the Bachs SANDBOX. No real money will move.');
}

/** Finish in-flight requests, then close the database, so a deploy never cuts a payment webhook in half. */
function shutDown(reason, exitCode = 0) {
  console.log(`${reason}, shutting down`);
  stopReconciliation();
  server.close(async () => {
    await disconnectDatabase();
    process.exit(exitCode);
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // do not hang forever on stuck connections
}
process.on('SIGTERM', () => shutDown('SIGTERM'));
process.on('SIGINT', () => shutDown('SIGINT'));

// A bug in one background task must never go unnoticed. Log it; after an uncaught exception the process state is
// unknown, so finish current requests and exit (your process manager restarts it).
process.on('unhandledRejection', (reason) => console.error('Unhandled promise rejection:', reason));
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutDown('uncaughtException', 1);
});
