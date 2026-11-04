import { z } from 'zod';
import { emailAddress, idParams, singleLineText } from './common.validators.js';
import { ORDER_ACTIONS } from '../services/order-workflow.js';

/** A guest proves ownership of an order with its number AND the email it was placed with. */
export const orderLookupSchema = z.strictObject({
  orderNumber: z.string().toUpperCase().regex(/^AUR-\d{6,8}$/),
  email: emailAddress,
});

export const adminOrderActionSchema = z.strictObject({
  action: z.enum(ORDER_ACTIONS),
  note: singleLineText(0, 300).optional(),
  carrier: singleLineText(0, 60).optional(),
  trackingNumber: singleLineText(0, 60).optional(),
  reference: singleLineText(0, 80).optional(), // Bachs refund id, when marking a refund as done by hand
  restock: z.boolean().optional(), // refund only: put the items back in stock
});

export const orderIdParams = idParams;
