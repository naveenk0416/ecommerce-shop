const isBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined';
// Always hit the deployed backend, in every environment (including local dev) — no local
// backend proxying.
const apiBase = 'https://ecommerce-shop.naveenkumar0416.workers.dev/api';

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | unknown;
}

export interface ApiError extends Error {
  status?: number;
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

  if (isBrowser) {
    const token = window.localStorage.getItem('auth_token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
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
    throw error;
  }

  return data as T;
}
