export class OperationTimeoutError extends Error {
  constructor(milliseconds) {
    super(`Operation timed out after ${milliseconds} ms`);
    this.name = 'OperationTimeoutError';
  }
}

/** Rejects if `promise` takes longer than `milliseconds`. The underlying work may still finish in the background. */
export function withTimeout(promise, milliseconds) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new OperationTimeoutError(milliseconds)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
