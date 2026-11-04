import { env } from '../config/env.js';

/** Public, non-secret settings the browser needs at start-up. */
export const getPublicConfig = (_request, response) =>
  response.json({
    oneSignalAppId: env.ONESIGNAL_APP_ID ?? null,
    googleClientId: env.GOOGLE_CLIENT_ID ?? null,
  });
