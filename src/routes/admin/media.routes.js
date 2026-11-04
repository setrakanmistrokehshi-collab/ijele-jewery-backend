import { Router } from 'express';
import { signImageUpload } from '../../controllers/media.controller.js';
import { uploadSignLimiter } from '../../middleware/rate-limiters.js';

export const adminMediaRouter = Router();

adminMediaRouter.post('/sign', uploadSignLimiter, signImageUpload);
