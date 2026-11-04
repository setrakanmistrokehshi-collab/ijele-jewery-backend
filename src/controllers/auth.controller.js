import { ADMIN_SESSION_COOKIE } from '../config/constants.js';
import { ADMIN_SESSION_LIFETIME_MS, adminSessionCookie, withoutMaxAge } from '../config/cookies.js';
import { Admin, AdminSession } from '../models/index.js';
import { verifyAdminPassword } from '../services/password.service.js';
import { generateSessionToken, hashSessionToken } from '../utils/tokens.js';
import { adminLoginSchema } from '../validators/auth.validators.js';

export async function login(request, response) {
  const { email, password } = adminLoginSchema.parse(request.body);

  const admin = await Admin.findOne({ email });
  const isPasswordCorrect = await verifyAdminPassword(admin, password);
  // Same answer whether the email or the password was wrong.
  if (!isPasswordCorrect) return response.status(401).json({ error: 'Invalid credentials' });

  const token = generateSessionToken();
  await AdminSession.create({
    tokenHash: hashSessionToken(token),
    admin: admin._id,
    expiresAt: new Date(Date.now() + ADMIN_SESSION_LIFETIME_MS),
  });
  return response.cookie(ADMIN_SESSION_COOKIE, token, adminSessionCookie).json({ ok: true });
}

export async function logout(request, response) {
  const token = request.cookies?.[ADMIN_SESSION_COOKIE];
  if (typeof token === 'string') await AdminSession.deleteOne({ tokenHash: hashSessionToken(token) });
  response.clearCookie(ADMIN_SESSION_COOKIE, withoutMaxAge(adminSessionCookie)).json({ ok: true });
}

/** Only reachable after `requireAdmin`, so reaching it means the session is valid. */
export const getCurrentAdmin = (_request, response) => response.json({ ok: true });
