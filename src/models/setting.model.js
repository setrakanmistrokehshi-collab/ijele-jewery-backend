import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const rate = (fallback) => ({ type: Number, min: 0.0001, max: 10_000_000, default: fallback });

/** One document (_id "store") holding the shop's adjustable settings. Missing fields fall back to the defaults. */
const settingSchema = new Schema(
  {
    _id: String,
    lowStockLimit: { type: Number, min: 0, max: 1000, default: 2, validate: Number.isInteger },
    // Units of each currency per 1 USD. Used to suggest prices when a product is created.
    rates: { NGN: rate(1500), EUR: rate(0.92), GBP: rate(0.79) },
  },
  { timestamps: true },
);

export const Setting = model('Setting', settingSchema);
