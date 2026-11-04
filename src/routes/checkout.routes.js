import { Router } from 'express';
import { createCheckoutSession } from '../controllers/checkout.controller.js';
import { checkoutLimiter } from '../middleware/rate-limiters.js';
import { requireSameOrigin } from '../middleware/require-same-origin.js';

// The Bachs webhook is NOT here: it needs the raw request body, so app.js mounts it before the JSON parser.
export const checkoutRouter = Router();

checkoutRouter.post('/create-session', requireSameOrigin, checkoutLimiter, createCheckoutSession);
