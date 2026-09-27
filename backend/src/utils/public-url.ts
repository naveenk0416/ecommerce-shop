import './env.js';

const DEFAULT_PUBLIC_API_URL = 'https://api.sellassist.in';
const RENDER_HOST = /(^|\.)onrender\.com$/i;

/**
 * Public base URL for links to this API that browsers and marketplaces fetch (product images).
 * PUBLIC_API_URL wins; otherwise BACKEND_URL — unless that still points at the old Render
 * deployment (*.onrender.com), which sleeps when idle and must never appear in the app or in data
 * sent to Amazon/Flipkart. BACKEND_URL itself is left alone because the OAuth callback URLs
 * registered with Amazon/Flipkart are built from it.
 */
export function publicApiUrl(): string {
  const candidates = [process.env['PUBLIC_API_URL'], process.env['BACKEND_URL']];
  for (const candidate of candidates) {
    const value = candidate?.trim().replace(/\/$/, '');
    if (!value) continue;
    try {
      if (RENDER_HOST.test(new URL(value).hostname)) continue;
    } catch {
      continue;
    }
    return value;
  }
  return DEFAULT_PUBLIC_API_URL;
}

/** Rewrites a stored image URL on the old Render host to the same path on our own domain. */
export function ownImageUrl<T>(value: T): T {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    if (!RENDER_HOST.test(url.hostname)) return value;
    return `${publicApiUrl()}${url.pathname}${url.search}` as T;
  } catch {
    return value;
  }
}

/** True for URLs pointing at the old Render deployment. */
export function isRenderUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    return RENDER_HOST.test(new URL(value).hostname);
  } catch {
    return false;
  }
}
