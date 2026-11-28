import { z } from 'zod';
import { CURRENCIES, SKU_PATTERN } from '../config/constants.js';
import { objectId, singleLineText } from './common.validators.js';
import { MAX_QUANTITY_PER_ITEM } from './checkout.validators.js';

const MAX_STANDARD_FEE_USD_CENTS = 1_000_000; // $10,000
const MAX_FREE_THRESHOLD_USD_CENTS = 10_000_000; // $100,000
const DEFAULT_FREE_THRESHOLD_USD_CENTS = 100_000; // $1,000

export const shippingZoneSchema = z.strictObject({
  name: singleLineText(1, 80),
  priority: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
  countries: z.array(singleLineText(1, 80)).max(50).default([]),
  states: z.array(singleLineText(1, 80)).max(100).default([]),
  cities: z.array(singleLineText(1, 80)).max(200).default([]),
  stdFeeUsd: z.number().int().min(0).max(MAX_STANDARD_FEE_USD_CENTS),
  expFeeUsd: z.number().int().min(0).max(MAX_STANDARD_FEE_USD_CENTS),
  freeStdThresholdUsd: z.number().int().min(0).max(MAX_FREE_THRESHOLD_USD_CENTS).default(DEFAULT_FREE_THRESHOLD_USD_CENTS),
  notes: singleLineText(0, 300).default(''),
});

/**
 * What the checkout page sends while the customer is still filling in the shipping form, so it can show a
 * live, server-computed fee (and free-shipping progress) before the order is actually created.
 * Mirrors checkoutRequestSchema's `items`/`shipping` shapes exactly, minus the fields only a real checkout needs
 * (phone, full address, idempotency key), so pricing logic never has to diverge between quote and real order.
 */
export const shippingQuoteSchema = z.strictObject({
  currency: z.enum(CURRENCIES),
  shipping: z.strictObject({
    country: z.string().trim().min(1).max(100),
    state: z.string().trim().max(100).default(''),
    city: z.string().trim().max(100).default(''),
    method: z.enum(['std', 'exp']),
  }),
  items: z
    .array(
      z.strictObject({
        sku: z.string().toUpperCase().regex(SKU_PATTERN),
        optionId: objectId.optional(),
        qty: z.number().int().min(1).max(MAX_QUANTITY_PER_ITEM),
      }),
    )
    .min(1)
    .max(20),
});
