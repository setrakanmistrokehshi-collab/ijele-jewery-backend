import mongoose from 'mongoose';

// Only the SHA-256 of the token is stored. A MongoDB TTL index deletes expired rows.
const adminSessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

// Third argument keeps the collection name ("sessions") used before this restructure, so existing data still works.
export const AdminSession = mongoose.model('Session', adminSessionSchema, 'sessions');
