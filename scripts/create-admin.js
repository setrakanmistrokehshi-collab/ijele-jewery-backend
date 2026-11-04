// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm run create-admin
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Admin } from '../src/models/index.js';
import { hashPassword } from '../src/services/password.service.js';

const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;
const MIN_PASSWORD_LENGTH = 8;

if (!email || !password || password.length < MIN_PASSWORD_LENGTH) {
  throw new Error(`Set ADMIN_EMAIL and ADMIN_PASSWORD (${MIN_PASSWORD_LENGTH}+ characters)`);
}

await connectDatabase();
await Admin.create({ email, passwordHash: await hashPassword(password) });
console.log('Admin created');
await disconnectDatabase();
