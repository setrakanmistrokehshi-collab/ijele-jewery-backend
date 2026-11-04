import { Router } from 'express';
import { listOrdersForGuest, trackOrder } from '../controllers/order.controller.js';
import { orderLookupLimiter } from '../middleware/rate-limiters.js';
import { requireSameOrigin } from '../middleware/require-same-origin.js';

export const orderRouter = Router();

orderRouter.use(requireSameOrigin, orderLookupLimiter);
orderRouter.post('/track', trackOrder);
orderRouter.post('/mine', listOrdersForGuest);
