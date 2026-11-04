import mongoose from 'mongoose';

const customerSessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export const CustomerSession = mongoose.model('UserSession', customerSessionSchema, 'usersessions');
