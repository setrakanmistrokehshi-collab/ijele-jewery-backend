import { z } from 'zod';
import { singleLineText } from './common.validators.js';

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
