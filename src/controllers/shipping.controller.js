import { ShippingZone } from '../models/index.js';
import { buildOrderLines } from '../services/checkout.service.js';
import { clearShippingZoneCache, resolveShippingFee } from '../services/shipping.service.js';
import { idParams } from '../validators/common.validators.js';
import { shippingQuoteSchema, shippingZoneSchema } from '../validators/shipping.validators.js';

const PUBLIC_ZONE_FIELDS = 'name priority countries states cities stdFeeUsd expFeeUsd freeStdThresholdUsd';

/** The checkout page uses this to show accurate fee estimates before the customer picks a country. */
export async function listPublicZones(_request, response) {
  const zones = await ShippingZone.find({ active: true }, PUBLIC_ZONE_FIELDS).sort({ priority: -1 }).lean();
  response.json(zones);
}

/**
 * Live shipping fee for the shipping form, recomputed as the customer fills in country/state/city/method.
 * Mirrors exactly what createCheckout charges at order time: goods total comes from the database via
 * buildOrderLines (never from prices the browser sends), then resolveShippingFee applies the same zone
 * matching and free-standard-delivery threshold used for the real order. Nothing here writes an order
 * or touches stock, so it is safe to call on every keystroke/debounce.
 */
export async function quoteShippingFee(request, response) {
  const { currency, items, shipping } = shippingQuoteSchema.parse(request.body);
  const lines = await buildOrderLines(items, currency);
  const goodsTotal = lines.reduce((total, line) => total + line.unitAmount * line.qty, 0);
  const { fee, zoneName, freeStandardThreshold } = await resolveShippingFee({ ...shipping, currency, goodsTotal });
  response.json({ fee, goodsTotal, zoneName, freeStandardThreshold });
}

// ---- Admin. The cache is cleared AFTER each write; clearing first would let a concurrent request reload old data. ----
export async function listZones(_request, response) {
  response.json(await ShippingZone.find().sort({ priority: -1, name: 1 }).lean());
}

export async function createZone(request, response) {
  const zone = await ShippingZone.create(shippingZoneSchema.parse(request.body));
  clearShippingZoneCache();
  response.status(201).json(zone);
}

export async function updateZone(request, response) {
  const { id } = idParams.parse(request.params);
  const zone = await ShippingZone.findByIdAndUpdate(id, shippingZoneSchema.parse(request.body), {
    returnDocument: 'after',
    runValidators: true,
  });
  clearShippingZoneCache();
  return zone ? response.json(zone) : response.status(404).json({ error: 'Not found' });
}

export async function deleteZone(request, response) {
  const { id } = idParams.parse(request.params);
  await ShippingZone.findByIdAndDelete(id);
  clearShippingZoneCache();
  response.sendStatus(204);
}
