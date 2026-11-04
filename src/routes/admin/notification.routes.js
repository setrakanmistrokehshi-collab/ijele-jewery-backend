import { Router } from 'express';
import { getStats, sendBroadcast } from '../../controllers/notification.controller.js';
import { broadcastLimiter } from '../../middleware/rate-limiters.js';

export const adminNotificationRouter = Router();

adminNotificationRouter.post('/broadcast', broadcastLimiter, sendBroadcast);
adminNotificationRouter.get('/stats', getStats);
