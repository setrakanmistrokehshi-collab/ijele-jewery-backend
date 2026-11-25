import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://localhost/test';
process.env.CLIENT_ORIGIN = 'https://store.example';
process.env.BACHS_API_KEY = 'sk_sandbox_test-key';
process.env.BACHS_ENV = 'sandbox';
process.env.BACHS_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.PUSH_ID_SECRET = 'test-push-id-secret';

const { errorHandler } = await import('../src/middleware/error-handler.js');
const { HttpError } = await import('../src/utils/http-error.js');

function responseStub() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('exposes whether a checkout failure is known to be safe to retry', () => {
  const response = responseStub();
  const error = new HttpError(502, 'Payment provider unavailable');
  error.outcomeUnknown = false;

  errorHandler(error, {}, response, () => {});

  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.body, {
    error: 'Payment provider unavailable',
    outcomeUnknown: false,
  });
});
