const isBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined';
const apiBase = (() => {
  if (!isBrowser) return '/api';
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return '/api';
  }
  return `${window.location.protocol}//${hostname}:4000/api`;
})();

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | unknown;
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
    throw new Error(message);
  }

  return data as T;
}
