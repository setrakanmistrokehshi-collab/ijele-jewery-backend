import { z } from 'zod';
import { env } from '../config/env.js';
import { PRODUCT_CATEGORIES } from '../config/constants.js';
import { multiLineText, sku, singleLineText } from './common.validators.js';

const MAX_PRICE_IN_MINOR_UNITS = 2_000_000_000;
const MAX_PHOTOS = 12;

const amount = z.number().int().min(0).max(MAX_PRICE_IN_MINOR_UNITS);
const amountPerCurrency = z.strictObject({ USD: amount, NGN: amount, EUR: amount, GBP: amount });
const freeGift = z.strictObject({ enabled: z.boolean(), name: singleLineText(0, 80) });

// Photos must be https Cloudinary delivery URLs from OUR cloud (when configured).
function isFromOurCloudinaryAccount(url) {
  const { pathname } = new URL(url);
  const isUploadedImage = pathname.includes('/image/upload/');
  const belongsToOurCloud = !env.CLOUDINARY_CLOUD_NAME || pathname.startsWith(`/${env.CLOUDINARY_CLOUD_NAME}/`);
  return isUploadedImage && belongsToOurCloud;
}

const photoUrl = z
  .url({ protocol: /^https$/, hostname: /^res\.cloudinary\.com$/ })
  .max(500)
  .refine(isFromOurCloudinaryAccount, 'Photo is not from our Cloudinary account');

const productFields = z.strictObject({
  name: singleLineText(1, 200),
  sku,
  description: multiLineText(1, 5000),
  category: z.enum(PRODUCT_CATEGORIES),
  stock: z.number().int().min(0).max(1_000_000),
  images: z
    .array(photoUrl)
    .max(MAX_PHOTOS)
    .refine((urls) => new Set(urls).size === urls.length, 'Duplicate photos'),
  prices: amountPerCurrency,
  costs: amountPerCurrency,
  seo: z.strictObject({ metaTitle: singleLineText(0, 60), metaDescription: singleLineText(0, 160) }),
  active: z.boolean(),
  freeGift,
});

// Only creation defaults the gift. Updates are partial and must NOT default it, or omitting it
// would silently switch an existing gift off.
export const createProductSchema = productFields.extend({
  freeGift: freeGift.default({ enabled: false, name: '' }),
});
export const updateProductSchema = productFields.partial();

export const productSkuParams = z.strictObject({ sku });
