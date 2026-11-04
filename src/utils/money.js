// All money is an integer in minor units (cents, kobo, pence). Bachs wants decimal strings, so we convert
// only at that boundary with string math, never floats. Every supported currency has two decimals.

export const minorUnitsToDecimalString = (minorUnits) =>
  `${Math.floor(minorUnits / 100)}.${String(minorUnits % 100).padStart(2, '0')}`;

export function decimalStringToMinorUnits(decimalString) {
  const [wholePart, fractionPart = ''] = String(decimalString).split('.');
  return parseInt(wholePart, 10) * 100 + parseInt(`${fractionPart}00`.slice(0, 2), 10);
}
