import { Resend } from 'resend';

// Raw SMTP is blocked outbound on Render (and most PaaS free/starter tiers, as an anti-abuse
// measure) — requests would hang for ~60-90s and then fail. Resend's API goes over HTTPS, so it
// isn't affected. RESEND_FROM must be an address on a domain verified in the Resend dashboard;
// until a domain is verified, Resend only accepts `onboarding@resend.dev` as the sender.
let client: Resend | null = null;

function getClient() {
  if (!client) {
    const apiKey = process.env['RESEND_API_KEY'];
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured. Set it in the backend .env file to send emails.');
    }
    client = new Resend(apiKey);
  }
  return client;
}

export async function sendMail(options: { to: string; subject: string; html: string }) {
  const from = process.env['RESEND_FROM'] || 'onboarding@resend.dev';
  const { error } = await getClient().emails.send({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  if (error) {
    throw new Error(error.message || 'Failed to send email');
  }
}
