import { Router } from 'express';
import {
  getCurrentCustomer, issueGoogleNonce, listCustomerOrders, signInWithGoogle, signOutCustomer,
} from '../controllers/customer.controller.js';
import { requireCustomer } from '../middleware/attach-customer.js';
import { customerSignInLimiter } from '../middleware/rate-limiters.js';
import { requireSameOrigin } from '../middleware/require-same-origin.js';

export const customerRouter = Router();

customerRouter.use(requireSameOrigin);
customerRouter.post('/google-nonce', customerSignInLimiter, issueGoogleNonce);
customerRouter.post('/google', customerSignInLimiter, signInWithGoogle);
customerRouter.get('/me', requireCustomer, getCurrentCustomer);
customerRouter.post('/logout', signOutCustomer);
customerRouter.get('/orders', requireCustomer, listCustomerOrders);
