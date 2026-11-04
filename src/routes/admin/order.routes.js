import { Router } from 'express';
import {
  deleteOrder, getOrderStats, listOrdersForAdmin, runOrderAction,
} from '../../controllers/order.controller.js';

export const adminOrderRouter = Router();

adminOrderRouter.get('/', listOrdersForAdmin);
adminOrderRouter.get('/stats', getOrderStats);
adminOrderRouter.post('/:id/action', runOrderAction);
adminOrderRouter.delete('/:id', deleteOrder);
