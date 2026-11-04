import { Router } from 'express';
import { getPublicProduct, listPublicProducts } from '../controllers/product.controller.js';
import { publicReadLimiter } from '../middleware/rate-limiters.js';

export const productRouter = Router();

productRouter.use(publicReadLimiter);
productRouter.get('/', listPublicProducts);
productRouter.get('/:sku', getPublicProduct);
