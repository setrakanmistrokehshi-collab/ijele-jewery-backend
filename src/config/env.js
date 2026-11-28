
import { z } from 'zod';

const optionalUrl = z.preprocess((value) => (value === '' ? undefined : value), z.url().optional());
const optionalEmail = z.preprocess((value) => (value === '' ? undefined : value), z.email().optional());
const optionalString = z.preprocess((value) => (value === '' ? undefined : value), z.string().trim().min(1).optional());

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    HOST: z.string().default('0.0.0.0'),
    // Proxies between the browser and this API (Browser -> Vercel -> Render -> API is 2). Wrong values make every
    // shopper share one rate-limit bucket, or let a client fake its IP.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(2),
    MONGO_URI: z.string().min(1),
    MONGO_MAX_POOL_SIZE: z.coerce.number().int().min(5).max(500).default(50),

    PAYMENT_MAX_CONCURRENT_CALLS: z.coerce.number().int().min(1).max(200).default(20),
    PAYMENT_MAX_QUEUED_CALLS: z.coerce.number().int().min(0).max(1000).default(40),

    // Accepts comma-separated origins
    CLIENT_ORIGIN: z
      .string()
      .transform((val) => val.split(',').map((s) => s.trim()).filter(Boolean))
      .pipe(z.array(z.url()).min(1)),

    ADMIN_ORIGIN: optionalUrl,

    BACHS_API_KEY: z.string().min(10),
    BACHS_ENV: z.enum(['sandbox', 'production']),
    BACHS_WEBHOOK_SECRET: z.string().min(10),

    PUSH_ID_SECRET: z.string().min(16),

    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    ONESIGNAL_APP_ID: z.string().optional(),
    ONESIGNAL_API_KEY: z.string().optional(),
    BREVO_API_KEY: optionalString,
    BREVO_SENDER_EMAIL: optionalEmail,
    BREVO_SENDER_NAME: optionalString,
  })
  .refine(
    (config) => Boolean(config.BREVO_API_KEY) === Boolean(config.BREVO_SENDER_EMAIL),
    {
      message: 'BREVO_API_KEY and BREVO_SENDER_EMAIL must both be configured',
      path: ['BREVO_API_KEY'],
    },
  )
  .refine(
    (config) =>
      config.BACHS_API_KEY.startsWith(
        config.BACHS_ENV === 'production' ? 'sk_live_' : 'sk_sandbox_',
      ),
    {
      message:
        'BACHS_API_KEY does not match BACHS_ENV (sk_live_ for production, sk_sandbox_ for sandbox)',
      path: ['BACHS_API_KEY'],
    },
  )
  .refine(
    (config) => {
      if (config.NODE_ENV !== 'production') return true;
      // In production, every origin must start with https://
      return config.CLIENT_ORIGIN.every((origin) => origin.startsWith('https://'));
    },
    {
      message: 'CLIENT_ORIGIN must be https:// in production',
      path: ['CLIENT_ORIGIN'],
    },
  );

export const env = environmentSchema.parse(process.env);

/** Browser origins allowed to call this API with credentials (CORS) and to send state-changing requests (CSRF). */
export const allowedOrigins = [
  ...env.CLIENT_ORIGIN,
  ...(env.ADMIN_ORIGIN ? [env.ADMIN_ORIGIN] : []),
]
  .filter(Boolean)
  .map((origin) => new URL(origin).origin);

export const isProduction = env.NODE_ENV === 'production';