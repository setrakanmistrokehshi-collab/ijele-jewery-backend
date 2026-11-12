/** Resolve a browser origin to a configured storefront origin for provider redirects. */
export function resolveClientOrigin(requestOrigin, configuredOrigins) {
  const origins = configuredOrigins.map((value) => new URL(value).origin);
  if (origins.length === 0) throw new Error('At least one CLIENT_ORIGIN must be configured');
  return origins.includes(requestOrigin) ? requestOrigin : origins[0];
}
