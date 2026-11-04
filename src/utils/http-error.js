/**
 * An error whose message is safe to show to the caller. Anything else becomes a generic 500.
 * `retryAfterSeconds` is sent as a Retry-After header (used for "server busy" answers).
 */
export class HttpError extends Error {
  constructor(status, message, { retryAfterSeconds } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
