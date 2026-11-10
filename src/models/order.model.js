import mongoose from 'mongoose';
import { CURRENCIES, ORDER_STATUSES } from '../config/constants.js';

const { Schema, model } = mongoose;

const isWholeNumber = (value) => Number.isInteger(value);
const minorUnitAmount = { type: Number, required: true, min: 0, validate: isWholeNumber };

// Audit trail of every admin action and every automatic change: who, what, when and why.
const historyEntrySchema = new Schema(
  {
    at: Date,
    by: String,
    action: String,
    from: String,
    to: String,
    note: { type: String, maxlength: 300 },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    items: [
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product' },
        sku: String,
        name: String,
        qty: Number,
        unitAmount: Number,
        unitCost: Number,
        gift: String,
      },
    ],
    orderNumber: { type: String, unique: true, sparse: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    email: { type: String, lowercase: true, index: true },
    phone: String,
    address: { name: String, line1: String, city: String, postal: String },
    shipping: {
      country: String,
      state: String,
      city: String,
      method: String,
      fee: { type: Number, min: 0, default: 0 },
    },
    step: { type: Number, min: 0, max: 3, default: 0 }, // 0 processing, 1 packed, 2 shipped, 3 delivered
    carrier: String,
    trackingNumber: String,
    currency: { type: String, enum: CURRENCIES, required: true },
    revenue: minorUnitAmount, // total charged to the customer
    operatingExpenses: minorUnitAmount, // sum of unitCost * qty
    netProfit: { type: Number, required: true, validate: isWholeNumber }, // revenue - operatingExpenses
    status: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    // Why a person has to look at this order (set while status is 'review'): see REVIEW_REASONS.
    reviewReason: String,
    // True once the reserved units went back on the shelf. It makes releasing stock happen at most once,
    // however many times an expiry webhook, the sweeper or an admin tries.
    stockReleased: { type: Boolean, default: false },
    bachsCheckoutId: { type: String, index: true },
    bachsChargeId: { type: String, index: true },
    paidAt: Date,
    refundedAt: Date,
    refundReference: String,
    history: [historyEntrySchema],
  },
  { timestamps: true },
);

export const Order = model('Order', orderSchema);
