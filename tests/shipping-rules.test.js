import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateFeeInUsdCents, convertUsdCentsToCurrency, findMatchingZone,
} from '../src/utils/shipping-rules.js';

const lagos = { name: 'Lagos', countries: ['Nigeria'], states: ['Lagos'], cities: [], stdFeeUsd: 1000, expFeeUsd: 2000, freeStdThresholdUsd: 50_000 };
const nigeria = { name: 'Nigeria', countries: ['Nigeria'], states: [], cities: [], stdFeeUsd: 1500, expFeeUsd: 3000, freeStdThresholdUsd: 0 };
const restOfWorld = { name: 'Rest of World', countries: [], states: [], cities: [], stdFeeUsd: 4000, expFeeUsd: 8000, freeStdThresholdUsd: 0 };
const zonesByPriority = [lagos, nigeria, restOfWorld];

test('the most specific zone listed first wins', () => {
  assert.equal(findMatchingZone(zonesByPriority, { country: 'nigeria', state: ' LAGOS ', city: '' }).name, 'Lagos');
  assert.equal(findMatchingZone(zonesByPriority, { country: 'Nigeria', state: 'Ogun', city: '' }).name, 'Nigeria');
  assert.equal(findMatchingZone(zonesByPriority, { country: 'Ghana', state: '', city: '' }).name, 'Rest of World');
});

test('returns null when no zone matches', () => {
  assert.equal(findMatchingZone([lagos], { country: 'Ghana', state: '', city: '' }), null);
});

test('standard delivery is free at or above the threshold, express never is', () => {
  assert.equal(calculateFeeInUsdCents(lagos, 'std', 49_999), 1000);
  assert.equal(calculateFeeInUsdCents(lagos, 'std', 50_000), 0);
  assert.equal(calculateFeeInUsdCents(lagos, 'exp', 999_999), 2000);
});

test('a threshold of 0 means standard delivery is never free', () => {
  assert.equal(calculateFeeInUsdCents(nigeria, 'std', 10_000_000), 1500);
});

test('falls back to default fees when there is no zone', () => {
  assert.equal(calculateFeeInUsdCents(null, 'std', 0), 2500);
  assert.equal(calculateFeeInUsdCents(null, 'exp', 0), 5500);
  assert.equal(calculateFeeInUsdCents(null, 'std', 100_000), 0);
});

test('converts USD cents into the order currency', () => {
  assert.equal(convertUsdCentsToCurrency(1000, 'NGN'), 1_500_000);
  assert.equal(convertUsdCentsToCurrency(1000, 'USD'), 1000);
});
