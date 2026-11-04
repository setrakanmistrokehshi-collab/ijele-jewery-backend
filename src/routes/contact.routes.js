import { Router } from 'express';
import { submitContactMessage } from '../controllers/contact.controller.js';
import { contactLimiter } from '../middleware/rate-limiters.js';
import { requireSameOrigin } from '../middleware/require-same-origin.js';

export const contactRouter = Router();

contactRouter.post('/', requireSameOrigin, contactLimiter, submitContactMessage);
