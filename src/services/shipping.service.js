// Shipping fee resolver. Active zones are cached in memory for a few minutes; the admin's create, update
// and delete endpoints clear the cache straight after they write.
import { ShippingZone } from '../models/index.js';
import {
  calculateFeeInUsdCents, convertCurrencyToUsdCents, convertUsdCentsToCurrency,
  DEFAULT_SHIPPING_FEES_USD, findMatchingZone,
} from '../utils/shipping-rules.js';

const ZONE_CACHE_LIFETIME_MS = 5 * 60 * 1000;
let zoneCache = null; // { zones, loadedAt }

export const clearShippingZoneCache = () => { zoneCache = null; };

async function loadActiveZones() {
  const isFresh = zoneCache && Date.now() - zoneCache.loadedAt < ZONE_CACHE_LIFETIME_MS;
  if (isFresh) return zoneCache.zones;
  const zones = await ShippingZone.find({ active: true }).sort({ priority: -1 }).lean();
  zoneCache = { zones, loadedAt: Date.now() };
  return zones;
}

/**
 * The fee the customer pays, in the order currency's minor units.
 * `goodsTotal` is the basket subtotal in the same currency.
 */
export async function resolveShippingFee({ country, state = '', city = '', method, currency, goodsTotal }) {
  const zones = await loadActiveZones();
  const zone = findMatchingZone(zones, { country, state, city });
  const feeInUsdCents = calculateFeeInUsdCents(zone, method, convertCurrencyToUsdCents(goodsTotal, currency));
  const freeAboveUsdCents = zone ? zone.freeStdThresholdUsd : DEFAULT_SHIPPING_FEES_USD.freeStandardThreshold;
  return {
    fee: convertUsdCentsToCurrency(feeInUsdCents, currency),
    zoneName: zone?.name ?? null,
    // 0 means standard delivery is never free for this zone; the checkout page uses this to show
    // "add X more for free shipping" instead of inventing its own copy of the threshold.
    freeStandardThreshold: freeAboveUsdCents > 0 ? convertUsdCentsToCurrency(freeAboveUsdCents, currency) : null,
  };
}
