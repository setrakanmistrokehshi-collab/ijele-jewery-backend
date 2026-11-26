import { Router } from 'express';
import { getOverview } from '../../controllers/overview.controller.js';

export const adminOverviewRouter = Router();

adminOverviewRouter.get('/', getOverview);
