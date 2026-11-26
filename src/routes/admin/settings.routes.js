import { Router } from 'express';
import { getSettings, updateSettings } from '../../controllers/settings.controller.js';

export const adminSettingsRouter = Router();

adminSettingsRouter.get('/', getSettings);
adminSettingsRouter.put('/', updateSettings);
