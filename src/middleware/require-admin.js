import { ADMIN_SESSION_COOKIE } from '../config/constants.js';
import { AdminSession } from '../models/index.js';
import { hashSessionToken } from '../utils/tokens.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';

/** Rejects the request unless it carries a valid, unexpired admin session cookie. Sets `request.adminId`. */
export async function requireAdmin(request, response, next) {
  const token = request.cookies?.[ADMIN_SESSION_COOKIE];
  if (typeof token !== 'string') return response.status(401).json({ error: 'Unauthorized' });

  const session = await AdminSession.findOne({
    tokenHash: hashSessionToken(token),
    expiresAt: trustedQueryOperator({ $gt: new Date() }),
  });
  if (!session) return response.status(401).json({ error: 'Unauthorized' });

  request.adminId = session.admin;
  return next();
}
