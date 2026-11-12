import mongoose from 'mongoose';
import { env } from './env.js';

// Neutralises $-operators smuggled into query filters, on top of the strict zod schemas used on every route.
mongoose.set('sanitizeFilter', true);

export const connectDatabase = (options = {}) =>
  mongoose.connect(env.MONGO_URI, {
    maxPoolSize: env.MONGO_MAX_POOL_SIZE, // concurrent database operations
    minPoolSize: 5, // keep a few connections warm so a traffic spike does not wait for handshakes
    serverSelectionTimeoutMS: 5000, // fail fast when the database is unreachable
    socketTimeoutMS: 45_000, // never let one stuck query hold a connection forever
    ...options,
  });
export const disconnectDatabase = () => mongoose.disconnect();
