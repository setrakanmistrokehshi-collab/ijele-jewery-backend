/** Personal, admin and payment responses must never be stored by a browser or a shared cache. */
export function noStore(_request, response, next) {
  response.set('Cache-Control', 'no-store');
  next();
}
