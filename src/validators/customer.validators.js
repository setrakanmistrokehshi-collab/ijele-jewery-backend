import { z } from 'zod';

export const googleSignInSchema = z.strictObject({ credential: z.string().min(20).max(4096) });
export const customerOrderParamsSchema = z.strictObject({
  orderNumber: z.string().regex(/^(?:AUR|IJL)-\d{6,8}$/),
});
export const deleteCustomerSchema = z.strictObject({ confirmation: z.literal('DELETE') });
