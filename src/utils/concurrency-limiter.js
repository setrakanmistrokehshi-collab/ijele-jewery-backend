import { HttpError } from './http-error.js';

/**
 * Lets at most `maxConcurrent` tasks run at once and holds up to `maxQueued` more in line. When the line is full
 * it refuses new work straight away with a 503. That keeps memory and open connections bounded under a rush:
 * the server answers "very busy" quickly instead of slowing down for everybody until it crashes.
 */
export class ConcurrencyLimiter {
  #maxConcurrent;
  #maxQueued;
  #activeCount = 0;
  #waiting = [];

  constructor({ maxConcurrent, maxQueued }) {
    this.#maxConcurrent = maxConcurrent;
    this.#maxQueued = maxQueued;
  }

  get stats() {
    return { active: this.#activeCount, queued: this.#waiting.length };
  }

  async run(task) {
    if (this.#activeCount < this.#maxConcurrent) {
      this.#activeCount += 1;
    } else if (this.#waiting.length < this.#maxQueued) {
      // The finishing task hands its slot straight to us, so the active count stays correct.
      await new Promise((resolve) => this.#waiting.push(resolve));
    } else {
      throw new HttpError(503, 'We are very busy right now. Please try again in a moment.', { retryAfterSeconds: 5 });
    }

    try {
      return await task();
    } finally {
      const next = this.#waiting.shift();
      if (next) next();
      else this.#activeCount -= 1;
    }
  }
}
