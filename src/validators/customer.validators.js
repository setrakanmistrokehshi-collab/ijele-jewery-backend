import { z } from 'zod';

export const googleSignInSchema = z.strictObject({ credential: z.string().min(20).max(4096) });
