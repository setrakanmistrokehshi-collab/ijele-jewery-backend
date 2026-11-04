import { z } from 'zod';

export const adminLoginSchema = z.strictObject({
  email: z.email().max(254).toLowerCase(),
  password: z.string().min(1).max(256),
});
