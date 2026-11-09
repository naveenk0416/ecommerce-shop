import type express from 'express';

/**
 * Session cookie for the web app: HttpOnly (page scripts — and so an XSS — can't read it), Secure,
 * SameSite=Lax. sellassist.in → api.sellassist.in is same-site, so the browser sends it with
 * `credentials: 'include'` while cross-site requests from other sites don't carry it.
 *
 * The JSON body still carries the token too: local development (localhost → the deployed API is
 * cross-site, so Lax cookies aren't sent) and sessions created before this change use the
 * Authorization: Bearer header, which keeps working.
 */
export const SESSION_COOKIE = 'sa_session';
/** Sent as `session` in sign-in responses, so the web app knows this API set the cookie (an older API
 * that only returns the token must keep working while the frontend is deployed ahead of it). */
export const SESSION_KIND = 'cookie' as const;
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // matches the JWT's 7d expiry

function cookieOptions(): express.CookieOptions {
  const domain = (process.env['SESSION_COOKIE_DOMAIN'] || '').trim();
  return {
    httpOnly: true,
    // Browsers drop Secure cookies on plain-http localhost; allow that only outside production.
    secure: process.env['NODE_ENV'] === 'production' || process.env['SESSION_COOKIE_INSECURE'] !== 'true',
    sameSite: 'lax',
    path: '/api',
    ...(domain ? { domain } : {}),
  };
}

/** "Remember me" (default) keeps the cookie for 7 days; otherwise it ends with the browser session. */
export function setSessionCookie(res: express.Response, token: string, persistent = true): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), ...(persistent ? { maxAge: SESSION_MAX_AGE_MS } : {}) });
}

export function clearSessionCookie(res: express.Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

/** The session token from "Authorization: Bearer …", else from the session cookie. */
export function readRequestToken(req: express.Request): string | null {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (bearer) return bearer;
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim()) || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}
