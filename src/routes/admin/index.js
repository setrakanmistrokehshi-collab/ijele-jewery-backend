import { Router } from 'express';
import { requireAdmin } from '../../middleware/require-admin.js';
import { requireSameOrigin } from '../../middleware/require-same-origin.js';
import { adminMediaRouter } from './media.routes.js';
import { adminMessageRouter } from './message.routes.js';
import { adminNotificationRouter } from './notification.routes.js';
import { adminOrderRouter } from './order.routes.js';
import { adminProductRouter } from './product.routes.js';
import { adminShippingZoneRouter } from './shipping-zone.routes.js';

/** Everything under /api/admin: CSRF check and a valid admin session are applied ONCE, here, for every route. */
export const adminRouter = Router();

adminRouter.use(requireSameOrigin, requireAdmin);
adminRouter.use('/products', adminProductRouter);
adminRouter.use('/orders', adminOrderRouter);
adminRouter.use('/messages', adminMessageRouter);
adminRouter.use('/shipping', adminShippingZoneRouter);
adminRouter.use('/notifications', adminNotificationRouter);
adminRouter.use('/media', adminMediaRouter);
