import { allowedOrigins } from '../config/env.js';
import { CSRF_HEADER_NAME } from '../config/constants.js';

// The site is same-origin in production (a reverse proxy routes /api here), so browsers never need CORS headers
// and by default get none. Only the origins in `allowedOrigins` are allowed, e.g. a Vite dev server on another port.
// Everything else is refused at preflight.
const ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE';
const ALLOWED_HEADERS = `Content-Type,${CSRF_HEADER_NAME},Idempotency-Key`;

export function cors(request, response, next) {
  const origin = request.get('origin');
  response.vary('Origin');

  // Server-to-server calls (Bachs webhooks, health checks) send no Origin header.
  if (!origin) return next();

  const isPreflight = request.method === 'OPTIONS';
  if (!allowedOrigins.includes(origin)) {
    // No CORS headers: the browser blocks the response from being read.
    return isPreflight ? response.sendStatus(403) : next();
  }

  response.set('Access-Control-Allow-Origin', origin);
  response.set('Access-Control-Allow-Credentials', 'true');
  if (!isPreflight) return next();

  response.set({
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Max-Age': '600',
  });
  return response.sendStatus(204);
}
