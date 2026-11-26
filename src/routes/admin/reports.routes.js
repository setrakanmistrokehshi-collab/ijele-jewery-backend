import { Router } from 'express';
import {
  exportCustomers, exportOrders, getAnalytics, listCustomers,
} from '../../controllers/admin-reports.controller.js';

export const adminReportsRouter = Router();

adminReportsRouter.get('/customers', listCustomers);
adminReportsRouter.get('/analytics', getAnalytics);
adminReportsRouter.get('/export/orders.csv', exportOrders);
adminReportsRouter.get('/export/customers.csv', exportCustomers);
