import { Router } from 'express';
import { listPublicZones, quoteShippingFee } from '../controllers/shipping.controller.js';
import { publicReadLimiter } from '../middleware/rate-limiters.js';
import { requireSameOrigin } from '../middleware/require-same-origin.js';

export const shippingRouter = Router();

shippingRouter.get('/zones/public', publicReadLimiter, listPublicZones);
// Read-only (computes a fee, never creates an order or touches stock) but still a POST, so it gets the
// same same-origin check as every other write-shaped route (contact form, checkout).
shippingRouter.post('/quote', requireSameOrigin, publicReadLimiter, quoteShippingFee);
