import helmet from 'helmet';

const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()';

// This service only returns JSON, so its CSP is maximally strict. The pages' CSP lives in frontend/server.
const helmetMiddleware = helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  referrerPolicy: { policy: 'no-referrer' },
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
  frameguard: { action: 'deny' },
});

function setPermissionsPolicy(_request, response, next) {
  response.set('Permissions-Policy', PERMISSIONS_POLICY);
  next();
}

export const securityHeaders = [helmetMiddleware, setPermissionsPolicy];
