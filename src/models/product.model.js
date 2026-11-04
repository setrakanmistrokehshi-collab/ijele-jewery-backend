import mongoose from 'mongoose';
import { CURRENCIES, PRODUCT_CATEGORIES } from '../config/constants.js';

const { Schema, model } = mongoose;

const isWholeNumber = (value) => Number.isInteger(value);
const minorUnitAmount = { type: Number, required: true, min: 0, validate: isWholeNumber };
const amountPerCurrency = Object.fromEntries(CURRENCIES.map((currency) => [currency, minorUnitAmount]));

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    sku: { type: String, required: true, unique: true, index: true, uppercase: true, trim: true },
    description: { type: String, required: true, maxlength: 5000 },
    category: { type: String, required: true, enum: PRODUCT_CATEGORIES },
    stock: { type: Number, min: 0, default: 0, validate: isWholeNumber },
    images: [{ type: String, maxlength: 500 }],
    prices: amountPerCurrency, // selling price, minor units
    costs: amountPerCurrency, // unit cost, minor units (feeds operating expenses)
    seo: {
      metaTitle: { type: String, maxlength: 60 },
      metaDescription: { type: String, maxlength: 160 },
    },
    active: { type: Boolean, default: true },
    // A gift the admin chooses to include with this product.
    freeGift: {
      enabled: { type: Boolean, default: false },
      name: { type: String, maxlength: 80, trim: true },
    },
  },
  { timestamps: true },
);

export const Product = model('Product', productSchema);
