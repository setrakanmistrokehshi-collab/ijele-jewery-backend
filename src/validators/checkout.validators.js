import { z } from 'zod';
import { CURRENCIES, SKU_PATTERN } from '../config/constants.js';
import { emailAddress, phoneNumber, singleLineText } from './common.validators.js';

export const MAX_QUANTITY_PER_ITEM = 10;

export const checkoutRequestSchema = z.strictObject({
  currency: z.enum(CURRENCIES),
  email: emailAddress,
  phone: phoneNumber,
  address: z.strictObject({
    name: singleLineText(1, 120),
    line1: singleLineText(1, 200),
    city: singleLineText(1, 100),
    postal: singleLineText(1, 20),
  }),
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
        qty: z.number().int().min(1).max(MAX_QUANTITY_PER_ITEM),
      }),
    )
    .min(1)
    .max(20),
});
