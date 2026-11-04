import mongoose from 'mongoose';

// One document per logical zone. An order matches the first zone (highest priority first) whose
// country, state and city lists all include its destination. An empty list matches anything.
// Fee fields are USD cents; checkout converts them into the order currency.
const shippingZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 }, // e.g. "Lagos", "UK", "Rest of World"
    priority: { type: Number, default: 0, index: true }, // higher number is checked first
    active: { type: Boolean, default: true },
    countries: [{ type: String, trim: true }],
    states: [{ type: String, trim: true }],
    cities: [{ type: String, trim: true }],
    stdFeeUsd: { type: Number, min: 0, default: 0 },
    expFeeUsd: { type: Number, min: 0, default: 0 },
    freeStdThresholdUsd: { type: Number, min: 0, default: 100_000 }, // 0 means standard delivery is never free
    notes: { type: String, maxlength: 300, default: '' }, // internal note for the admin
  },
  { timestamps: true },
);

export const ShippingZone = mongoose.model('ShippingZone', shippingZoneSchema);
