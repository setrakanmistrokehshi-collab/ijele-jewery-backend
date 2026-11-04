import { MILLISECONDS_PER_DAY, MILLISECONDS_PER_HOUR } from './constants.js';

const secureCookieDefaults = { httpOnly: true, secure: true, sameSite: 'strict', path: '/' };

export const ADMIN_SESSION_LIFETIME_MS = 8 * MILLISECONDS_PER_HOUR;
export const CUSTOMER_SESSION_LIFETIME_MS = 30 * MILLISECONDS_PER_DAY;

export const adminSessionCookie = { ...secureCookieDefaults, maxAge: ADMIN_SESSION_LIFETIME_MS };
export const customerSessionCookie = { ...secureCookieDefaults, maxAge: CUSTOMER_SESSION_LIFETIME_MS };

// The Google sign-in nonce only needs to survive until the visitor clicks the Google button.
export const GOOGLE_NONCE_LIFETIME_MS = 5 * 60 * 1000;
export const googleNonceCookie = { ...secureCookieDefaults, maxAge: GOOGLE_NONCE_LIFETIME_MS };

/** `clearCookie` must use the same attributes as the cookie that was set, minus maxAge. */
export const withoutMaxAge = ({ maxAge, ...attributes }) => attributes;
