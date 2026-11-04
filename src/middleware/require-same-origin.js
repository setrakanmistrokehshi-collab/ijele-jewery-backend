import { allowedOrigins } from '../config/env.js';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '../config/constants.js';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * CSRF defence in depth on top of SameSite=Strict cookies: writes need a custom header
 * and, when the browser sends an Origin, it must be one of ours.
 */
export function requireSameOrigin(request, response, next) {
  if (SAFE_METHODS.includes(request.method)) return next();

  const origin = request.get('origin');
  const hasCsrfHeader = request.get(CSRF_HEADER_NAME) === CSRF_HEADER_VALUE;
  const isOriginAllowed = !origin || allowedOrigins.includes(origin);
  if (!hasCsrfHeader || !isOriginAllowed) return response.status(403).json({ error: 'Forbidden' });
  return next();
}
