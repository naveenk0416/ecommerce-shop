/**
 * Integration tests for POST /api/listings/:id/sales against a throwaway in-memory MongoDB.
 * MONGO_URI is set to the in-memory server BEFORE the app is imported (dotenv never overrides an
 * existing variable), and the suite aborts if the connection isn't local — it can never touch
 * the real database.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer;
let server: Server;
let base = '';
let token = '';
let Listing: any;
let ListingDraft: any;

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['MONGO_URI'] = mongo.getUri();
  process.env['VERCEL'] = '1'; // don't bind the app's own port
  process.env['JWT_SECRET'] = 'test-secret';

  const common = await import('./common.js');
  await common.ensureConnected();
  const mongoose = (await import('mongoose')).default;
  assert.match(mongoose.connection.host, /^(127\.0\.0\.1|localhost)$/, 'refusing to run against a non-local database');
  Listing = common.Listing;
  ListingDraft = common.ListingDraft;

  const user = await new common.User({ email: 'test@example.com', passwordHash: 'x', emailVerified: true }).save();
  const jwt = (await import('jsonwebtoken')).default;
  token = jwt.sign({ uid: user._id.toString(), email: user.email }, 'test-secret');

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

const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as any };
};

async function createListing(quantity: unknown) {
  const res = await api('POST', '/listings', { name: 'Cotton kurti', hsnCode: '62044220', sellingPrice: 499, mrp: 999, costPrice: 220, quantity, priceINR: '₹499' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.id as string;
}

test('stock 4, sell 1 → 3 (and the response carries the updated listing)', async () => {
  const id = await createListing(4);
  const res = await api('POST', `/listings/${id}/sales`, { platform: 'Offline', quantity: 1, salePrice: 499 });
  assert.equal(res.status, 200);
  assert.equal(res.body.previousStock, 4);
  assert.equal(res.body.stock, 3);
  assert.equal(res.body.listing.quantity, 3);
  const stored = await Listing.findById(id).lean();
  assert.equal(stored.quantity, 3);
});

test('selling 5 when stock is 3 → rejected, stock unchanged', async () => {
  const id = await createListing(3);
  const res = await api('POST', `/listings/${id}/sales`, { platform: 'Offline', quantity: 5, salePrice: 499 });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /Only 3 units in stock/);
  assert.equal((await Listing.findById(id).lean()).quantity, 3);
});

test('quantity must be a positive whole number', async () => {
  const id = await createListing(10);
  for (const quantity of [0, -1, 1.5, 'abc']) {
    const res = await api('POST', `/listings/${id}/sales`, { quantity, salePrice: 499 });
    assert.equal(res.status, 400, `quantity ${quantity}`);
  }
  assert.equal((await Listing.findById(id).lean()).quantity, 10);
});

test('concurrent sales never oversell', async () => {
  const id = await createListing(3);
  const results = await Promise.all(Array.from({ length: 6 }, () => api('POST', `/listings/${id}/sales`, { quantity: 1, salePrice: 499 })));
  assert.equal(results.filter((r) => r.status === 200).length, 3);
  assert.equal((await Listing.findById(id).lean()).quantity, 0);
});

test('legacy text stock ("50 units") is converted and decremented', async () => {
  const doc = await new Listing({ uid: (await api('GET', '/me')).body.user.uid, name: 'Old', quantity: '50 units' }).save();
  const res = await api('POST', `/listings/${doc._id}/sales`, { quantity: 2, salePrice: 100 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.stock, 48);
});

test('listing save stores numbers and computes GST server-side (client gstRate ignored)', async () => {
  const res = await api('POST', '/listings', { name: 'Kurti', hsnCode: '6204', sellingPrice: '₹499', mrp: '₹1,299', costPrice: '245', quantity: '4', gstRate: '18%' });
  assert.equal(res.status, 200);
  assert.equal(res.body.gstRate, 5);
  assert.equal(res.body.mrp, 1299);
  assert.equal(res.body.sellingPrice, 499);
  assert.equal(res.body.quantity, 4);
  const patched = await api('PATCH', `/listings/${res.body.id}`, { sellingPrice: 3000, mrp: 3500 });
  assert.equal(patched.body.gstRate, 18);
});

test('MRP below selling price and negative values are rejected', async () => {
  assert.equal((await api('POST', '/listings', { name: 'X', sellingPrice: 500, mrp: 400 })).status, 400);
  assert.equal((await api('POST', '/listings', { name: 'X', sellingPrice: 500, costPrice: -1 })).status, 400);
  assert.equal((await api('POST', '/listings', { name: 'X', sellingPrice: 500, quantity: 2.5 })).status, 400);
});

test('drafts: create, list, load, update, duplicate, delete (with inventory link)', async () => {
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  const results = { general: { productTitle: { values: ['Blue kurti'], confidence: 90, reason: 'x' } }, instagram: { caption: { values: ['Hi'], confidence: 80, reason: 'y' } } };
  const created = await api('POST', '/drafts', { image, results });
  assert.equal(created.status, 201);
  assert.equal(created.body.title, 'Blue kurti');
  const id = created.body.id;

  const list = await api('GET', '/drafts');
  assert.equal(list.body[0].id, id);
  assert.ok(list.body[0].imageUrl.includes(`/api/drafts/${id}/image.jpg`));
  assert.equal(list.body[0].results, undefined, 'list must not ship full content');

  results.general.productTitle.values = ['Red kurti'];
  await api('PATCH', `/drafts/${id}`, { results });
  const loaded = await api('GET', `/drafts/${id}`);
  assert.equal(loaded.body.results.general.productTitle.values[0], 'Red kurti');
  assert.equal(loaded.body.results.instagram.caption.values[0], 'Hi');

  const img = await fetch(`${base}/drafts/${id}/image.jpg`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');

  const dup = await api('POST', `/drafts/${id}/duplicate`);
  assert.equal(dup.body.title, 'Copy of Red kurti');

  const listingId = await createListing(1);
  await api('PATCH', `/listings/${listingId}`, { draftId: id });
  await api('PATCH', `/drafts/${id}`, { status: 'saved', inventoryListingId: listingId });
  await api('DELETE', `/drafts/${id}`);
  assert.equal(await ListingDraft.findById(id), null);
  assert.equal((await Listing.findById(listingId).lean()).draftId, undefined);
});
