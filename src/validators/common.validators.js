// Shared zod building blocks. Free text is rejected if it contains control characters (NUL, escape codes,
// line breaks in single-line fields): they are never legitimate input and they corrupt logs and exports.
import { z } from 'zod';
import { OBJECT_ID_PATTERN, SKU_PATTERN } from '../config/constants.js';

const ANY_CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const CONTROL_CHARACTER_EXCEPT_NEWLINE = /[\u0000-\u0009\u000B-\u001F\u007F]/;

/** Single-line text, trimmed. */
export const singleLineText = (min, max) =>
  z.string().trim().min(min).max(max).refine((value) => !ANY_CONTROL_CHARACTER.test(value), 'Contains invalid characters');

/** Multi-line text (messages, descriptions), trimmed. */
export const multiLineText = (min, max) =>
  z.string().trim().min(min).max(max).refine((value) => !CONTROL_CHARACTER_EXCEPT_NEWLINE.test(value), 'Contains invalid characters');

export const emailAddress = z.email().max(254).toLowerCase();

export const phoneNumber = z
  .string()
  .regex(/^\+?[0-9 ()-]{7,20}$/)
  .refine((value) => value.replace(/\D/g, '').length >= 7, 'Invalid phone number');

export const objectId = z.string().regex(OBJECT_ID_PATTERN);
export const sku = z.string().trim().toUpperCase().regex(SKU_PATTERN);
export const idParams = z.strictObject({ id: objectId });
