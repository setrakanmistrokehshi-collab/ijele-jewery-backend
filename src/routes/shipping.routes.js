import { Router } from 'express';
import { listPublicZones } from '../controllers/shipping.controller.js';
import { publicReadLimiter } from '../middleware/rate-limiters.js';

export const shippingRouter = Router();

shippingRouter.get('/zones/public', publicReadLimiter, listPublicZones);
