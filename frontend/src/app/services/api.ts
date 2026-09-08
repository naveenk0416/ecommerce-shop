const isBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined';
// Always hit the deployed backend, in every environment (including local dev) — no local
// backend proxying.
const apiBase = 'https://ecommerce-shop-dins.onrender.com/api';

const AUTH_TOKEN_KEY = 'auth_token';

/** Reads the session token from whichever storage holds it — localStorage when "Remember me"
 * was checked (persists across browser restarts), sessionStorage otherwise (cleared on tab close). */
export function getAuthToken(): string | null {
  if (!isBrowser) return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY) ?? window.sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string, remember: boolean): void {
  if (!isBrowser) return;
  clearAuthToken();
  (remember ? window.localStorage : window.sessionStorage).setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (!isBrowser) return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
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

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
    body,
  });

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
