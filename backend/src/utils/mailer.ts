import { Resend } from 'resend';

// Raw SMTP is blocked outbound on Render (and most PaaS free/starter tiers, as an anti-abuse
// measure) — requests would hang for ~60-90s and then fail. Resend's API goes over HTTPS, so it
// isn't affected.
//
// Sender config comes from the environment:
//   RESEND_FROM     e.g. 'SellAssist <noreply@sellassist.in>' — must be on a domain verified in
//                   the Resend dashboard. The sandbox 'onboarding@resend.dev' only delivers to the
//                   Resend account owner, so real users never receive mail from it.
//   RESEND_REPLY_TO e.g. 'support@sellassist.in'
let client: Resend | null = null;

function getClient() {
  if (!client) {
    const apiKey = process.env['RESEND_API_KEY'];
    if (!apiKey) {
      throw new MailDeliveryError('RESEND_API_KEY is not configured. Set it in the backend .env file to send emails.', 'not_configured');
    }
    client = new Resend(apiKey);
  }
  return client;
}

export type MailFailureReason = 'domain_not_verified' | 'not_configured' | 'send_failed';

/** Thrown when an email could not be handed to Resend — callers must tell the user it wasn't sent. */
export class MailDeliveryError extends Error {
  constructor(message: string, readonly reason: MailFailureReason) {
    super(message);
    this.name = 'MailDeliveryError';
  }
}

/** Friendly text for the end user whenever a transactional email couldn't be sent. */
export const MAIL_UNAVAILABLE_MESSAGE = "We couldn't send the email right now, please try again shortly.";

export async function sendMail(options: { to: string; subject: string; html: string }) {
  const from = process.env['RESEND_FROM'] || 'onboarding@resend.dev';
  const replyTo = process.env['RESEND_REPLY_TO'] || undefined;

  let result;
  try {
    result = await getClient().emails.send({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      ...(replyTo ? { replyTo } : {}),
    });
  } catch (err: any) {
    if (err instanceof MailDeliveryError) throw err;
    console.error('[mailer] Resend request failed:', err?.message || err);
    throw new MailDeliveryError(err?.message || 'Failed to send email', 'send_failed');
  }

  const { error } = result;
  if (error) {
    const message = error.message || 'Failed to send email';
    if (/domain.*not verified|verify a domain|not verified/i.test(message)) {
      console.error(`[mailer] SENDER DOMAIN NOT VERIFIED — Resend rejected from="${from}". Verify the domain in the Resend dashboard (and its DNS records), then retry. Resend said: ${message}`);
      throw new MailDeliveryError(message, 'domain_not_verified');
    }
    console.error(`[mailer] Resend rejected email to ${options.to} (${error.name ?? 'error'}): ${message}`);
    throw new MailDeliveryError(message, 'send_failed');
  }
}
