import { ZodError } from 'zod';
import { isProduction } from '../config/env.js';
import { HttpError } from '../utils/http-error.js';

export const notFoundHandler = (_request, response) => response.status(404).json({ error: 'Not found' });

const DUPLICATE_KEY_ERROR_CODE = 11000;

/** Express 5 forwards rejected async handlers here. Callers only ever see short, generic messages. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, _request, response, _next) {
  if (error instanceof HttpError) {
    if (error.retryAfterSeconds) response.set('Retry-After', String(error.retryAfterSeconds));
    return response.status(error.status).json({ error: error.message });
  }

  if (error instanceof ZodError) {
    // Field paths are a road map for crafted attacks, so production never shows them.
    const issues = isProduction ? undefined : error.issues.map(({ path, message }) => ({ path, message }));
    return response.status(400).json({ error: 'Invalid request', ...(issues && { issues }) });
  }

  if (error?.code === DUPLICATE_KEY_ERROR_CODE) return response.status(409).json({ error: 'Duplicate value' });

  // Malformed JSON and oversized bodies are the client's fault: answer 4xx and keep them out of the error log.
  const status = error?.status ?? error?.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return response.status(status).json({ error: status === 413 ? 'Request too large' : 'Invalid request' });
  }

  console.error(error);
  return response.status(500).json({ error: 'Internal error' });
}
