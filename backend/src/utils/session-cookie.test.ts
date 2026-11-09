import { test } from 'node:test';
import assert from 'node:assert/strict';
import type express from 'express';
import { clearSessionCookie, readRequestToken, SESSION_COOKIE, setSessionCookie } from './session-cookie.js';

function fakeRes() {
  const calls: { name: string; value?: string; options: any; cleared?: boolean }[] = [];
  const res = {
    cookie: (name: string, value: string, options: any) => { calls.push({ name, value, options }); return res; },
    clearCookie: (name: string, options: any) => { calls.push({ name, options, cleared: true }); return res; },
  };
  return { res: res as unknown as express.Response, calls };
}

test('"Remember me" on: HttpOnly, Secure, SameSite=Lax cookie with a 7-day Max-Age', () => {
  const { res, calls } = fakeRes();
  setSessionCookie(res, 'tok', true);
  const { name, value, options } = calls[0];
  assert.equal(name, SESSION_COOKIE);
  assert.equal(value, 'tok');
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.maxAge, 7 * 24 * 60 * 60 * 1000);
});

test('"Remember me" off: browser-session cookie (no Max-Age)', () => {
  const { res, calls } = fakeRes();
  setSessionCookie(res, 'tok', false);
  assert.equal(calls[0].options.maxAge, undefined);
});

test('logout clears the cookie with the same path', () => {
  const { res, calls } = fakeRes();
  setSessionCookie(res, 'tok');
  clearSessionCookie(res);
  assert.equal(calls[1].cleared, true);
  assert.equal(calls[1].options.path, calls[0].options.path);
});

test('reads the token from the cookie when there is no Authorization header (reload)', () => {
  const req = { headers: { cookie: `other=1; ${SESSION_COOKIE}=abc.def; x=2` } } as unknown as express.Request;
  assert.equal(readRequestToken(req), 'abc.def');
});

test('Bearer header wins; no header and no cookie gives null', () => {
  assert.equal(readRequestToken({ headers: { authorization: 'Bearer b1', cookie: `${SESSION_COOKIE}=c1` } } as any), 'b1');
  assert.equal(readRequestToken({ headers: {} } as any), null);
});
