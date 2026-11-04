import { Router } from 'express';
import { getCurrentAdmin, login, logout } from '../controllers/auth.controller.js';
import { adminLoginAccountLimiter, adminLoginIpLimiter } from '../middleware/rate-limiters.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { requireSameOrigin } from '../middleware/require-same-origin.js';

export const authRouter = Router();

authRouter.use(requireSameOrigin);
authRouter.post('/login', adminLoginIpLimiter, adminLoginAccountLimiter, login);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAdmin, getCurrentAdmin);
