import { z } from 'zod';
import { emailAddress, multiLineText, phoneNumber, singleLineText } from './common.validators.js';

export const CONTACT_TOPICS = ['Product enquiry', 'Order support', 'Private appointment', 'Other'];

export const contactMessageSchema = z.strictObject({
  name: singleLineText(1, 100),
  email: emailAddress,
  phone: phoneNumber.or(z.literal('')).optional(),
  topic: z.enum(CONTACT_TOPICS),
  message: multiLineText(10, 2000),
  website: z.string().max(200).optional(), // honeypot: real visitors leave it empty
});

export const markHandledSchema = z.strictObject({ handled: z.boolean() });
