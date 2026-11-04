import { Router } from 'express';
import { getPublicConfig } from '../controllers/config.controller.js';
import { configLimiter } from '../middleware/rate-limiters.js';
import { adminRouter } from './admin/index.js';
import { authRouter } from './auth.routes.js';
import { checkoutRouter } from './checkout.routes.js';
import { contactRouter } from './contact.routes.js';
import { customerRouter } from './customer.routes.js';
import { orderRouter } from './order.routes.js';
import { productRouter } from './product.routes.js';
import { shippingRouter } from './shipping.routes.js';

/** Mounted at /api. */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/checkout', checkoutRouter);
apiRouter.use('/shipping', shippingRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/contact', contactRouter);
apiRouter.use('/user', customerRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.get('/config', configLimiter, getPublicConfig);
