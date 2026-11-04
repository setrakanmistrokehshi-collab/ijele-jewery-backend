import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateNonce, nonceMatches } from '../src/utils/nonce.js';

test('a nonce matches only itself', () => {
  const nonce = generateNonce();
  assert.equal(nonceMatches(nonce, nonce), true);
  assert.equal(nonceMatches(nonce, generateNonce()), false);
});

test('a missing, empty or non-string nonce never matches', () => {
  assert.equal(nonceMatches(undefined, undefined), false);
  assert.equal(nonceMatches('', ''), false);
  assert.equal(nonceMatches('abc', undefined), false);
  assert.equal(nonceMatches('abc', 123), false);
});

test('nonces are long and different every time', () => {
  assert.ok(generateNonce().length >= 32);
  assert.notEqual(generateNonce(), generateNonce());
});
