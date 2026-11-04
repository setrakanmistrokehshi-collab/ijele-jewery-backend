// Central rate limits. All counters are in memory, which is correct for one API process.
// Switch to rate-limit-redis if you ever run several API instances.
import rateLimit from 'express-rate-limit';
import { Admin } from '../models/index.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

const sharedOptions = {
  standardHeaders: 'draft-8', // sends Retry-After
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({ error: 'Too many requests' }),
};

const createLimiter = (options) => rateLimit({ ...sharedOptions, ...options });

/** Stops volumetric floods before any route handler or database query runs. Health checks are never limited. */
export const globalLimiter = createLimiter({
  windowMs: MINUTE,
  limit: 300,
  skip: (request) => request.path === '/healthz',
});

/** Public catalogue and shipping-zone reads: headroom for crawlers, tight enough to slow bulk scraping. */
export const publicReadLimiter = createLimiter({ windowMs: MINUTE, limit: 90 });

/** /api/config is fetched once per page load. */
export const configLimiter = createLimiter({ windowMs: MINUTE, limit: 10 });

/**
 * Order tracking and "my orders" lookups. Order numbers have only 10 million possible values, so a few
 * attempts per window make enumerating them (together with an email) impractical.
 */
export const orderLookupLimiter = createLimiter({ windowMs: 15 * MINUTE, limit: 8 });

/** Google sign-in: plenty for real use, stops hammering with stolen tokens. */
export const customerSignInLimiter = createLimiter({ windowMs: 15 * MINUTE, limit: 15 });

/** Admin login, counted per account so rotating IP addresses does not help an attacker. */
export const adminLoginAccountLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: async (request) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase().slice(0, 254) : '';
    const isKnownAdmin = email && (await Admin.exists({ email }));
    return isKnownAdmin ? `account:${email}` : 'account:unknown';
  },
});

/** Admin login, counted per IP as well, so one machine cannot probe many accounts. */
export const adminLoginIpLimiter = createLimiter({ windowMs: 15 * MINUTE, limit: 20, skipSuccessfulRequests: true });

/** Each checkout reserves stock for 30 minutes. Without a limit one browser could park the whole catalogue. */
export const checkoutLimiter = createLimiter({ windowMs: 15 * MINUTE, limit: 10 });

/**
 * Bachs webhooks. Generous, because Bachs retries and may redeliver in bursts, but still bounded so a flood of forged
 * requests (rejected by the signature check) cannot tie up the server.
 */
export const webhookLimiter = createLimiter({ windowMs: MINUTE, limit: 600 });

/** Contact form: five messages per hour per IP. */
export const contactLimiter = createLimiter({ windowMs: 60 * MINUTE, limit: 5 });

/** Cloudinary upload signatures are cheap but should not be mass-produced. */
export const uploadSignLimiter = createLimiter({ windowMs: MINUTE, limit: 20 });

/** A broadcast wakes every subscriber's device. One a minute is generous. */
export const broadcastLimiter = createLimiter({ windowMs: MINUTE, limit: 1 });
