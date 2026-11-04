import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decimalStringToMinorUnits, minorUnitsToDecimalString } from '../src/utils/money.js';

test('converts minor units to a decimal string without floats', () => {
  assert.equal(minorUnitsToDecimalString(1250050), '12500.50');
  assert.equal(minorUnitsToDecimalString(5), '0.05');
  assert.equal(minorUnitsToDecimalString(100), '1.00');
});

test('converts a decimal string back to minor units', () => {
  assert.equal(decimalStringToMinorUnits('12500.50'), 1250050);
  assert.equal(decimalStringToMinorUnits('12500.5'), 1250050);
  assert.equal(decimalStringToMinorUnits('12500'), 1250000);
});
