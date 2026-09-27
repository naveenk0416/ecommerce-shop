import crypto from 'node:crypto';
import type express from 'express';

/**
 * The client IP and browser id, used only to stop self-referrals from the same device or network.
 * IPs are never stored in clear — only as a salted hash.
 *
 * Behind a reverse proxy (nginx), set TRUST_PROXY=1 so the real client IP is read from
 * X-Forwarded-For; otherwise every request looks like it comes from the proxy itself. Private and
 * loopback addresses are ignored, so a missing TRUST_PROXY never blocks every referral.
 */
function clientIp(req: express.Request): string | null {
  let ip = req.ip || req.socket?.remoteAddress || '';
  if (process.env['TRUST_PROXY']) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) ip = forwarded;
  }
  ip = ip.replace(/^::ffff:/, '');
  if (!ip) return null;
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip)) return null;
  return ip;
}

export function ipHash(req: express.Request): string | null {
  const ip = clientIp(req);
  if (!ip) return null;
  const salt = process.env['JWT_SECRET'] || 'sellassist';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/** Random per-browser id the frontend keeps in localStorage and sends as X-Device-Id. */
export function deviceId(req: express.Request): string | null {
  const raw = String(req.headers['x-device-id'] || req.body?.deviceId || '').trim();
  return /^[A-Za-z0-9-]{8,64}$/.test(raw) ? raw : null;
}
