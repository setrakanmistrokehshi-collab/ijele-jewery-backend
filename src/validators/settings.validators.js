import { z } from 'zod';

const rate = z.number().min(0.0001).max(10_000_000);

export const settingsSchema = z.strictObject({
  lowStockLimit: z.number().int().min(0).max(1000),
  rates: z.strictObject({ NGN: rate, EUR: rate, GBP: rate }),
});

export const analyticsQuery = z.object({ days: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30) });
