import { z } from 'zod';
import { singleLineText } from './common.validators.js';

export const broadcastSchema = z.strictObject({
  title: singleLineText(1, 100),
  body: singleLineText(10, 300),
  // https only: a push notification must never open a javascript: or data: address.
  url: z.url({ protocol: /^https$/ }).optional(),
});
