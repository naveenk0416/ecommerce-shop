import { clearAuthToken, cookieOnlySession, getAuthToken, hasSession, setAuthToken } from './api';

describe('session storage choice', () => {
  it('uses the cookie only on sellassist.in when the API confirms it set one', () => {
    expect(cookieOnlySession('sellassist.in', 'cookie')).toBe(true);
    expect(cookieOnlySession('www.sellassist.in', 'cookie')).toBe(true);
  });

  it('keeps the token when the API did not set a cookie (older API deployed)', () => {
    expect(cookieOnlySession('sellassist.in', undefined)).toBe(false);
    expect(cookieOnlySession('sellassist.in', null)).toBe(false);
  });

  it('keeps the token on other hosts (localhost is cross-site to the API)', () => {
    expect(cookieOnlySession('localhost', 'cookie')).toBe(false);
    expect(cookieOnlySession('evil-sellassist.in.example.com', 'cookie')).toBe(false);
  });
});

describe('token storage (non-cookie host)', () => {
  afterEach(() => clearAuthToken());

  it('"Remember me" on survives a reload via localStorage', () => {
    setAuthToken('t1', true, 'cookie');
    expect(localStorage.getItem('auth_token')).toBe('t1');
    expect(getAuthToken()).toBe('t1');
    expect(hasSession()).toBe(true);
  });

  it('"Remember me" off keeps the token for this tab only', () => {
    setAuthToken('t2', false);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(sessionStorage.getItem('auth_token')).toBe('t2');
  });

  it('logout removes everything', () => {
    setAuthToken('t3', true);
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
    expect(hasSession()).toBe(false);
  });
});
