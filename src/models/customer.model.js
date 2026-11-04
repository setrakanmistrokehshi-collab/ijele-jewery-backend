import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    googleSub: { type: String, required: true, unique: true },
    email: { type: String, lowercase: true, index: true },
    name: String,
    picture: String,
    // True when Google is authoritative for the address (gmail.com or a Google Workspace domain).
    trusted: Boolean,
  },
  { timestamps: true },
);

// Third argument keeps the collection name ("users") used before this restructure, so existing data still works.
export const Customer = mongoose.model('User', customerSchema, 'users');
