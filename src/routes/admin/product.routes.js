import { Router } from 'express';
import {
  createProduct, deleteProduct, listAllProducts, updateProduct,
} from '../../controllers/product.controller.js';

export const adminProductRouter = Router();

adminProductRouter.get('/', listAllProducts);
adminProductRouter.post('/', createProduct);
adminProductRouter.put('/:id', updateProduct);
adminProductRouter.delete('/:id', deleteProduct);
