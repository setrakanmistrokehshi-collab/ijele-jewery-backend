// Pure shipping rules (no database), so they are easy to read and to test.
// Fee fields on a zone are USD cents; checkout converts them into the order currency.

/** Fixed estimate rates, relative to USD. The storefront mirrors these for its fee preview. */
export const USD_EXCHANGE_RATES = { USD: 1, NGN: 1500, EUR: 0.92, GBP: 0.79 };

/** Used when no zone is configured or none matches. All values are USD cents. */
export const DEFAULT_SHIPPING_FEES_USD = { standard: 2500, express: 5500, freeStandardThreshold: 100_000 };

const normalise = (text) => String(text ?? '').trim().toLowerCase();
const matchesList = (list, value) => list.length === 0 || list.some((entry) => normalise(entry) === value);

/**
 * Returns the first zone covering the location. `zones` must already be sorted by priority, highest first.
 * An empty countries/states/cities list means "match anything" for that level.
 */
export function findMatchingZone(zones, { country, state, city }) {
  const wanted = { country: normalise(country), state: normalise(state), city: normalise(city) };
  return (
    zones.find(
      (zone) =>
        matchesList(zone.countries, wanted.country) &&
        matchesList(zone.states, wanted.state) &&
        matchesList(zone.cities, wanted.city),
    ) ?? null
  );
}

/** Fee in USD cents for the chosen method ('std' or 'exp'), applying the free-standard-delivery threshold. */
export function calculateFeeInUsdCents(zone, method, goodsTotalInUsdCents) {
  const standardFee = zone ? zone.stdFeeUsd : DEFAULT_SHIPPING_FEES_USD.standard;
  const expressFee = zone ? zone.expFeeUsd : DEFAULT_SHIPPING_FEES_USD.express;
  const freeAbove = zone ? zone.freeStdThresholdUsd : DEFAULT_SHIPPING_FEES_USD.freeStandardThreshold;

  if (method === 'exp') return expressFee;
  const qualifiesForFreeDelivery = freeAbove > 0 && goodsTotalInUsdCents >= freeAbove;
  return qualifiesForFreeDelivery ? 0 : standardFee;
}

export const convertUsdCentsToCurrency = (usdCents, currency) =>
  Math.round(usdCents * (USD_EXCHANGE_RATES[currency] ?? 1));

export const convertCurrencyToUsdCents = (minorUnits, currency) =>
  Math.round(minorUnits / (USD_EXCHANGE_RATES[currency] ?? 1));
