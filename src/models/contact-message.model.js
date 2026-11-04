import mongoose from 'mongoose';

const contactMessageSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    phone: String,
    topic: String,
    message: String,
    handled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);
