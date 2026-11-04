import { CUSTOMER_SESSION_COOKIE } from '../config/constants.js';
import { CustomerSession } from '../models/index.js';
import { hashSessionToken } from '../utils/tokens.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';

/** Loads `request.customer` from the session cookie. Never rejects: guests simply have no customer. */
export async function attachCustomer(request, _response, next) {
  const token = request.cookies?.[CUSTOMER_SESSION_COOKIE];
  if (typeof token === 'string') {
    const session = await CustomerSession
      .findOne({ tokenHash: hashSessionToken(token), expiresAt: trustedQueryOperator({ $gt: new Date() }) })
      .populate('customer');
    if (session?.customer) request.customer = session.customer;
  }
  next();
}

/** Rejects guests. Use after `attachCustomer`. */
export function requireCustomer(request, response, next) {
  if (!request.customer) return response.status(401).json({ error: 'Signed out' });
  return next();
}
