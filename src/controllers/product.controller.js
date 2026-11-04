import { Product } from '../models/index.js';
import { toPublicProduct } from '../serializers/product.serializer.js';
import { idParams } from '../validators/common.validators.js';
import {
  createProductSchema, productSkuParams, updateProductSchema,
} from '../validators/product.validators.js';

const notFound = (response) => response.status(404).json({ error: 'Not found' });

// ---- Public ----
export async function listPublicProducts(_request, response) {
  const products = await Product.find({ active: true }).sort({ createdAt: -1 }).lean();
  response.json(products.map(toPublicProduct));
}

export async function getPublicProduct(request, response) {
  const params = productSkuParams.safeParse(request.params);
  const product = params.success ? await Product.findOne({ sku: params.data.sku, active: true }).lean() : null;
  return product ? response.json(toPublicProduct(product)) : notFound(response);
}

// ---- Admin ----
export async function listAllProducts(_request, response) {
  response.json(await Product.find().sort({ createdAt: -1 }).lean());
}

export async function createProduct(request, response) {
  const product = await Product.create(createProductSchema.parse(request.body));
  response.status(201).json(product);
}

export async function updateProduct(request, response) {
  const { id } = idParams.parse(request.params);
  const changes = updateProductSchema.parse(request.body);
  const product = await Product.findByIdAndUpdate(id, { $set: changes }, { new: true, runValidators: true });
  return product ? response.json(product) : notFound(response);
}

export async function deleteProduct(request, response) {
  const { id } = idParams.parse(request.params);
  const result = await Product.deleteOne({ _id: id });
  return result.deletedCount ? response.status(204).end() : notFound(response);
}
