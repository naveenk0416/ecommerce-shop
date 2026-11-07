import { getDeviceId } from '../utils/device-id';

const isBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined';
// Always hit the deployed backend, in every environment (including local dev) — no local
// backend proxying.
export const apiBase = 'https://api.sellassist.in/api';

const AUTH_TOKEN_KEY = 'auth_token';
/** Not a secret: only tells the app a cookie session probably exists, so a signed-out visitor
 * doesn't get a pointless 401 from /me on every page load. */
const SESSION_HINT_KEY = 'sa_session_hint';

/**
 * On sellassist.in the session lives in an HttpOnly cookie set by the API (same-site with
 * api.sellassist.in), so no token is kept in localStorage/sessionStorage where an XSS could read
 * it. Elsewhere (localhost → the deployed API is cross-site, so the cookie isn't sent) the token is
 * kept in sessionStorage/localStorage as before.
 */
const cookieSession = isBrowser && /(^|\.)sellassist\.in$/i.test(window.location.hostname);

/** This page's token (cookie mode): covers the time until the first reload. Never persisted. */
let memoryToken: string | null = null;

function storage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The Bearer token to send, if any: this page's token, else a token stored before the cookie
 * session existed (still valid until it expires; removed on sign-out). */
export function getAuthToken(): string | null {
  if (!isBrowser) return null;
  return memoryToken ?? storage('local')?.getItem(AUTH_TOKEN_KEY) ?? storage('session')?.getItem(AUTH_TOKEN_KEY) ?? null;
}

/** True when a session may exist (a Bearer token, or a cookie session started on this browser). */
export function hasSession(): boolean {
  if (!isBrowser) return false;
  return !!getAuthToken() || (cookieSession && !!(storage('local')?.getItem(SESSION_HINT_KEY) ?? storage('session')?.getItem(SESSION_HINT_KEY)));
}

export function setAuthToken(token: string, remember: boolean): void {
  if (!isBrowser) return;
  clearAuthToken();
  if (cookieSession) {
    // The API also set the HttpOnly cookie; keep only a non-secret hint plus this page's copy.
    memoryToken = token;
    storage(remember ? 'local' : 'session')?.setItem(SESSION_HINT_KEY, '1');
    return;
  }
  storage(remember ? 'local' : 'session')?.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (!isBrowser) return;
  memoryToken = null;
  for (const kind of ['local', 'session'] as const) {
    storage(kind)?.removeItem(AUTH_TOKEN_KEY);
    storage(kind)?.removeItem(SESSION_HINT_KEY);
  }
}

/** Signs out server-side too: clears the HttpOnly cookie (scripts can't). */
export function endServerSession(): Promise<void> {
  if (!isBrowser) return Promise.resolve();
  return fetch(`${apiBase}/logout`, { method: 'POST', credentials: 'include' }).then(() => undefined, () => undefined);
}

type CoinBalanceListener = (balance: { free: number; paid: number }) => void;
let coinBalanceListener: CoinBalanceListener | null = null;

/** WalletService registers here; the backend sends X-Coin-Balance: "free,paid" whenever coins may have changed. */
export function onCoinBalance(listener: CoinBalanceListener): void {
  coinBalanceListener = listener;
}

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | unknown;
}

export interface ApiError extends Error {
  status?: number;
  /** The full parsed JSON error body, when there is one — lets a caller read structured fields
   * (e.g. Amazon's raw `issues` array) beyond just the flattened `message` string. */
  data?: unknown;
}

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers as HeadersInit || {});
  let body: BodyInit | null = null;

  if (options.body !== undefined && options.body !== null) {
    if (options.body instanceof FormData) {
      body = options.body;
    } else {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.body);
    }
  }

  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const deviceId = getDeviceId();
  if (deviceId) headers.set('X-Device-Id', deviceId);

  const response = await fetch(`${apiBase}${path}`, {
    // Sends the HttpOnly session cookie (same-site api.sellassist.in).
    credentials: 'include',
    ...options,
    headers,
    body,
  });

  const coinHeader = response.headers.get('X-Coin-Balance');
  if (coinHeader && coinBalanceListener) {
    const [free, paid] = coinHeader.split(',').map(Number);
    if (Number.isFinite(free) && Number.isFinite(paid)) coinBalanceListener({ free, paid });
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.error || data?.message || response.statusText || 'API request failed';
    const error: ApiError = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}
