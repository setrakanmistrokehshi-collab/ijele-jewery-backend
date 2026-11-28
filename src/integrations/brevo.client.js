import { env } from '../config/env.js';

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

export const isBrevoConfigured = () => Boolean(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL);

/** Sends a transactional email via Brevo. Throws when Brevo answers with an error status. */
export async function sendBrevoEmail({ to, subject, htmlContent }) {
  const response = await fetch(BREVO_API, {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: {
        email: env.BREVO_SENDER_EMAIL,
        name: env.BREVO_SENDER_NAME || 'Ijele Smart Jewelry',
      },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo responded with ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
}
