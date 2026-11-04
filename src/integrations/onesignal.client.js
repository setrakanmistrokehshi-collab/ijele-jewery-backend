import { env } from '../config/env.js';

const ONESIGNAL_API = 'https://api.onesignal.com';

export const isOneSignalConfigured = () => Boolean(env.ONESIGNAL_APP_ID && env.ONESIGNAL_API_KEY);

const authorizationHeaders = { Authorization: `Key ${env.ONESIGNAL_API_KEY}` };

/** Sends one notification (push or email). Throws when OneSignal answers with an error status. */
export async function sendOneSignalNotification(payload) {
  const response = await fetch(`${ONESIGNAL_API}/notifications`, {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/json', ...authorizationHeaders },
    body: JSON.stringify({ app_id: env.ONESIGNAL_APP_ID, ...payload }),
  });
  if (!response.ok) throw new Error(`OneSignal responded with ${response.status}`);
}

/** Subscriber counts for the admin dashboard, or null when OneSignal is unavailable. */
export async function fetchOneSignalSubscriberStats() {
  const response = await fetch(`${ONESIGNAL_API}/apps/${env.ONESIGNAL_APP_ID}`, {
    headers: authorizationHeaders,
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) return null;
  const app = await response.json();
  return { total: app.players, optedIn: app.messageable_players };
}
