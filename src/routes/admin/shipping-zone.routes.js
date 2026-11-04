import { Router } from 'express';
import {
  createZone, deleteZone, listZones, updateZone,
} from '../../controllers/shipping.controller.js';

export const adminShippingZoneRouter = Router();

adminShippingZoneRouter.get('/zones', listZones);
adminShippingZoneRouter.post('/zones', createZone);
adminShippingZoneRouter.put('/zones/:id', updateZone);
adminShippingZoneRouter.delete('/zones/:id', deleteZone);
