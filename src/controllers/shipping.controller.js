import { ShippingZone } from '../models/index.js';
import { clearShippingZoneCache } from '../services/shipping.service.js';
import { idParams } from '../validators/common.validators.js';
import { shippingZoneSchema } from '../validators/shipping.validators.js';

const PUBLIC_ZONE_FIELDS = 'name priority countries states cities stdFeeUsd expFeeUsd freeStdThresholdUsd';

/** The checkout page uses this to show accurate fee estimates before the customer picks a country. */
export async function listPublicZones(_request, response) {
  const zones = await ShippingZone.find({ active: true }, PUBLIC_ZONE_FIELDS).sort({ priority: -1 }).lean();
  response.json(zones);
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
    new: true,
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
