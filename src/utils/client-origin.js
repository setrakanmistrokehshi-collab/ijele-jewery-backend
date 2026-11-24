import { isIP } from 'node:net';

function isPublicHttpsOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return false;
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    const [first, second] = hostname.split('.').map(Number);
    if (
      first === 0 || first === 10 || first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    ) return false;
  }
  if (ipVersion === 6 && (hostname === '::' || hostname === '::1' || /^(fc|fd|fe[89ab])/i.test(hostname))) {
    return false;
  }

  return true;
}

/** Resolve a browser origin to a configured storefront origin for provider redirects. */
export function resolveClientOrigin(requestOrigin, configuredOrigins) {
  const origins = configuredOrigins.map((value) => new URL(value).origin);
  const publicOrigins = origins.filter(isPublicHttpsOrigin);
  if (requestOrigin) {
    try {
      const requested = new URL(requestOrigin).origin;
      if (publicOrigins.includes(requested)) return requested;
    } catch {
      // Ignore malformed request origins and use the configured public fallback.
    }
  }
  return publicOrigins[0] ?? null;
}
