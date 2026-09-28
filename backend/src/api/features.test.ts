/**
 * "Coming soon" publish flags and "Notify me" — against a throwaway in-memory MongoDB. No request
 * ever reaches Amazon, Flipkart, Meesho or Instagram: the blocked routes answer before any
 * marketplace call, and the price/stock check uses a product that was never synced.
 */
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer;
let server: Server;
let base = '';
let common: any;
let jwt: any;
const FLAGS = ['FLIPKART_PUBLISH_ENABLED', 'MEESHO_PUBLISH_ENABLED', 'INSTAGRAM_PUBLISH_ENABLED'];

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['MONGO_URI'] = mongo.getUri();
  process.env['VERCEL'] = '1';
  process.env['JWT_SECRET'] = 'test-secret';
  // Empty (not deleted) so dotenv can't load the real values from backend/.env.
  for (const key of ['GEMINI_API_KEY', 'RESEND_API_KEY', 'TRUST_PROXY', 'FLIPKART_CLIENT_ID', 'FLIPKART_CLIENT_SECRET', ...FLAGS]) process.env[key] = '';

  common = await import('./common.js');
  await common.ensureConnected();
  const mongoose = (await import('mongoose')).default;
  assert.match(mongoose.connection.host, /^(127\.0\.0\.1|localhost)$/, 'refusing to run against a non-local database');
  jwt = (await import('jsonwebtoken')).default;

  const app = (await import('../server.js')).default;
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(async () => {
  server?.close();
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(() => {
  for (const key of FLAGS) process.env[key] = '';
});

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data };
}

async function seller(fields: Record<string, unknown> = {}) {
  const user = await new common.User({ email: `s${crypto.randomBytes(4).toString('hex')}@example.test`, passwordHash: 'x', emailVerified: true, ...fields }).save();
  return { uid: user._id.toString(), token: jwt.sign({ uid: user._id.toString(), email: user.email }, 'test-secret') as string };
}

test('flags default to off: only Amazon is publishable', async () => {
  const res = await api('GET', '/features');
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.publish, { amazon: true, flipkart: false, meesho: false, instagram: false });

  process.env['FLIPKART_PUBLISH_ENABLED'] = 'true';
  assert.equal((await api('GET', '/features')).data.publish.flipkart, true, 'going live is a config change');
});

test('publishing a new listing to Flipkart, Meesho or Instagram is refused while the flag is off', async () => {
  const { uid, token } = await seller();
  const listing = await common.Listing.create({ uid, name: 'Cotton kurti', sellingPrice: 499, quantity: 3 });
  const id = listing._id.toString();

  const flipkart = await api('POST', `/marketplace-connections/flipkart/create-listing/${id}`, {}, token);
  assert.equal(flipkart.status, 403);
  assert.equal(flipkart.data.error, 'Flipkart publishing is coming soon');
  assert.equal(flipkart.data.code, 'COMING_SOON');

  for (const path of ['meesho/publish', 'meesho/create-listing', 'instagram/publish', 'instagram/create-listing']) {
    const res = await api('POST', `/marketplace-connections/${path}/${id}`, {}, token);
    assert.equal(res.status, 403, path);
    assert.match(res.data.error, /^(Meesho|Instagram) publishing is coming soon$/);
  }

  // Unauthenticated callers are turned away before anything else.
  assert.equal((await api('POST', `/marketplace-connections/flipkart/create-listing/${id}`, {})).status, 401);

  // Nothing about the product changed.
  const after = await common.Listing.findById(id).lean();
  assert.equal(after.source, undefined);
  assert.equal(after.listingStatus, listing.listingStatus);
});

test('Flipkart price/stock push route is not blocked by the flag', async () => {
  const { uid, token } = await seller();
  // Never synced from Flipkart, so the route answers with its usual 400 before calling Flipkart.
  const listing = await common.Listing.create({ uid, name: 'Local product', sellingPrice: 199, quantity: 1 });
  const res = await api('POST', `/marketplace-connections/flipkart/publish/${listing._id}`, {}, token);
  assert.equal(res.status, 400);
  assert.match(res.data.error, /Sync from Flipkart/);
  assert.notEqual(res.data.code, 'COMING_SOON');
});

test('"Notify me" is recorded once per seller per feature', async () => {
  const { uid, token } = await seller();
  const first = await api('POST', '/features/notify-me', { feature: 'flipkart_publish' }, token);
  assert.equal(first.status, 200);
  assert.equal(first.data.alreadyRequested, false);
  const second = await api('POST', '/features/notify-me', { feature: 'flipkart_publish' }, token);
  assert.equal(second.data.alreadyRequested, true);
  await Promise.all([1, 2, 3].map(() => api('POST', '/features/notify-me', { feature: 'flipkart_publish' }, token)));

  const rows = await common.FeatureInterest.find({ uid }).lean();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].feature, 'flipkart_publish');
  assert.ok(rows[0].createdAt instanceof Date);

  assert.deepEqual((await api('GET', '/features/notify-me', undefined, token)).data.features, ['flipkart_publish']);
  assert.equal((await api('POST', '/features/notify-me', { feature: 'free_money' }, token)).status, 400);
  assert.equal((await api('POST', '/features/notify-me', { feature: 'flipkart_publish' })).status, 401);
});

test('admin stats show "Notify me" counts per feature', async () => {
  const a = await seller();
  const b = await seller();
  await api('POST', '/features/notify-me', { feature: 'meesho_publish' }, a.token);
  await api('POST', '/features/notify-me', { feature: 'meesho_publish' }, b.token);
  await api('POST', '/features/notify-me', { feature: 'instagram_publish' }, b.token);
  const admin = await seller({ role: 'ADMIN' });

  const stats = await api('GET', '/admin/stats', undefined, admin.token);
  assert.equal(stats.status, 200);
  assert.equal(stats.data.featureNotifyMe.meesho_publish, 2);
  assert.equal(stats.data.featureNotifyMe.instagram_publish, 1);
  assert.ok('flipkart_publish' in stats.data.featureNotifyMe);

  const csv = await api('GET', '/admin/stats.csv?type=summary', undefined, admin.token);
  assert.match(csv.data, /"featureNotifyMe\.meesho_publish","2"/);
});
