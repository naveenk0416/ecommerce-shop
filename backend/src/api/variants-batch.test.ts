/**
 * Sizes & colours (inventory, sales, bulk files, Amazon parent/child push) and "Add many
 * products" batches, against a throwaway in-memory MongoDB. Gemini and Amazon are both faked —
 * nothing here can reach a real AI account or a real marketplace.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer;
let server: Server;
let base = '';
let common: any;
let worker: typeof import('../batch/worker.js');
let gemini: typeof import('../utils/gemini.js');
let spApi: typeof import('../utils/amazon-sp-api.js');
let jwt: any;

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['MONGO_URI'] = mongo.getUri();
  process.env['VERCEL'] = '1'; // don't bind the app's own port or start the real worker loop
  process.env['JWT_SECRET'] = 'test-secret';
  process.env['PUBLIC_API_URL'] = 'https://api.example.test';

  common = await import('./common.js');
  await common.ensureConnected();
  const mongoose = (await import('mongoose')).default;
  assert.match(mongoose.connection.host, /^(127\.0\.0\.1|localhost)$/, 'refusing to run against a non-local database');
  jwt = (await import('jsonwebtoken')).default;
  worker = await import('../batch/worker.js');
  gemini = await import('../utils/gemini.js');
  spApi = await import('../utils/amazon-sp-api.js');

  const app = (await import('../server.js')).default;
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(async () => {
  worker.stopBatchWorker();
  await worker.drainBatchWorker();
  gemini.setGeminiGeneratorForTests(null);
  spApi.setSpApiFetchForTests(null);
  server?.close();
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
  await mongo?.stop();
});

async function newSeller(coins = 20) {
  const email = `seller${Math.random().toString(36).slice(2)}@example.com`;
  const { monthKey } = await import('../config/coins.js');
  // Welcome bonus already received and this month's top-up done: the balance is exactly `coins`.
  const user = await new common.User({ email, passwordHash: 'x', emailVerified: true, coins: { free: coins, paid: 0 }, walletInitAt: new Date(), lastTopupMonth: monthKey(), referralCode: `R${Math.random().toString(36).slice(2, 10)}` }).save();
  await common.CoinLedger.create({ uid: user._id.toString(), type: 'welcome_bonus', amount: 10, free: 10, reason: 'test', key: 'welcome' });
  const token = jwt.sign({ uid: user._id.toString(), email }, 'test-secret');
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
  return { uid: user._id.toString(), api };
}

const KURTI_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const kurtiVariants = () => KURTI_SIZES.map((size) => ({ size, colour: 'Pink', stock: 5 }));

// ---------------------------------------------------------------- variants helpers

test('size presets, SKUs and validation', async () => {
  const v = await import('../utils/variants.js');
  assert.equal(v.suggestSizePreset('Women > Ethnic Wear > Kurtis'), 'alpha');
  assert.equal(v.suggestSizePreset('Men > Jeans'), 'waist');
  assert.equal(v.suggestSizePreset('Footwear > Sandals'), 'shoe_uk');
  assert.equal(v.suggestSizePreset('Kids > Girls Frocks'), 'kids');
  assert.equal(v.suggestSizePreset('Sarees'), 'free');
  assert.equal(v.suggestSizePreset('Jewellery > Earrings'), null);
  assert.equal(v.autoSku('65f1a2b3c4d5e6f7a8b9c0d1', 'Navy Blue', 'XL'), 'SA-A8B9C0D1-NAVYBLUE-XL');
  assert.match(v.sanitizeVariants([{ size: 'M', colour: 'Pink' }, { size: 'm', colour: 'pink' }]).error!, /listed twice/);
  assert.match(v.sanitizeVariants([{ size: 'M', stock: -1 }]).error!, /whole number/);
  const ok = v.sanitizeVariants(kurtiVariants());
  assert.equal(ok.variants!.length, 5);
  const withSkus = v.assignSkus('65f1a2b3c4d5e6f7a8b9c0d1', ok.variants!);
  assert.deepEqual(withSkus.map((x) => x.sku), KURTI_SIZES.map((s) => `SA-A8B9C0D1-PINK-${s}`));
});

// ---------------------------------------------------------------- inventory + sales

test('kurti S–XXL, stock 5 each: a sale of 1 × M lowers only M; low stock is per size', async () => {
  const { api } = await newSeller();
  const created = await api('POST', '/listings', { name: 'Pink cotton kurti', hsnCode: '62044220', sellingPrice: 499, mrp: 999, costPrice: 220, priceINR: '₹499', variants: kurtiVariants() });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = created.body.id;
  assert.equal(created.body.quantity, 25);
  assert.equal(created.body.variants.length, 5);
  assert.ok(created.body.variants.every((x: any) => x.sku.startsWith('SA-') && x.sku.endsWith(`-PINK-${x.size}`)));

  const m = created.body.variants.find((x: any) => x.size === 'M');
  const noSize = await api('POST', `/listings/${id}/sales`, { platform: 'Offline', quantity: 1, salePrice: 499 });
  assert.equal(noSize.status, 400, 'a product with sizes needs the size that was sold');

  const sale = await api('POST', `/listings/${id}/sales`, { platform: 'Offline', quantity: 1, salePrice: 499, variantId: m.id });
  assert.equal(sale.status, 200, JSON.stringify(sale.body));
  assert.equal(sale.body.previousStock, 5);
  assert.equal(sale.body.stock, 4);
  assert.equal(sale.body.variantLabel, 'Pink / M');
  const stored = await common.Listing.findById(id).lean();
  assert.deepEqual(stored.variants.map((x: any) => [x.size, x.stock]), [['S', 5], ['M', 4], ['L', 5], ['XL', 5], ['XXL', 5]]);
  assert.equal(stored.quantity, 24);
  const saleRow = await common.Sale.findOne({ listingId: id }).lean();
  assert.equal(saleRow.variantLabel, 'Pink / M');

  const oversell = await api('POST', `/listings/${id}/sales`, { platform: 'Offline', quantity: 5, salePrice: 499, variantId: m.id });
  assert.equal(oversell.status, 409);
  assert.match(oversell.body.error, /Only 4 units of Pink \/ M in stock/);

  const { lowStockVariants } = await import('../utils/variants.js');
  assert.equal(lowStockVariants(stored, 5).length, 5, 'every size at ≤5 is low');
  assert.deepEqual(lowStockVariants(stored, 4), [{ id: m.id, label: 'Pink / M', stock: 4 }]);

  // One total can't be split across sizes.
  const badPatch = await api('PATCH', `/listings/${id}`, { quantity: 30 });
  assert.equal(badPatch.status, 400);
  const edit = await api('PATCH', `/listings/${id}`, { variants: stored.variants.map((x: any) => ({ ...x, stock: x.size === 'L' ? 1 : x.stock })) });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(edit.body.quantity, 20);
  assert.equal(edit.body.variants.find((x: any) => x.size === 'L').sku, stored.variants.find((x: any) => x.size === 'L').sku, 'SKU kept on edit');
});

test('older single-size products read as one default variant and sell as before', async () => {
  const { uid, api } = await newSeller();
  const legacy = await new common.Listing({ uid, name: 'Old product', quantity: 7, sku: 'OLD-1' }).save();
  const list = await api('GET', '/listings');
  const row = list.body.find((l: any) => l.id === legacy._id.toString());
  assert.deepEqual(row.variants.map((x: any) => [x.id, x.size, x.colour, x.sku, x.stock]), [['default', null, null, 'OLD-1', 7]]);
  const sale = await api('POST', `/listings/${legacy._id}/sales`, { platform: 'Offline', quantity: 2, salePrice: 100 });
  assert.equal(sale.status, 200);
  assert.equal(sale.body.stock, 5);
  // A new single product stores its default variant; stock follows quantity.
  const plain = await api('POST', '/listings', { name: 'Mug', sellingPrice: 199, quantity: 3 });
  assert.equal(plain.body.variants.length, 1);
  assert.equal(plain.body.variants[0].stock, 3);
  const patched = await api('PATCH', `/listings/${plain.body.id}`, { quantity: 9 });
  assert.equal(patched.body.variants[0].stock, 9);
});

// ---------------------------------------------------------------- bulk files

test('Meesho/Flipkart file: 1 product × 5 sizes = 5 rows with one group id; sizes fit the dropdown', async () => {
  const { fillRows } = await import('../bulk/fill.js');
  const { assignSkus, sanitizeVariants } = await import('../utils/variants.js');
  const draftId = '65f1a2b3c4d5e6f7a8b9c0d1';
  const variants = assignSkus(draftId, sanitizeVariants(kurtiVariants()).variants!);
  const col = (n: number, header: string, field: any, extra: Record<string, unknown> = {}) => ({ col: n, letter: String.fromCharCode(64 + n), header, field, required: true, neverInvent: false, allowed: null, ...extra });
  const template: any = {
    hash: 't1', category: 'Kurtis', columns: [
      col(1, 'Seller SKU ID', 'sku'),
      col(2, 'Group ID', 'group_id', { neverInvent: true, required: false }),
      col(3, 'Size', 'size', { allowed: ['Small', 'Medium', 'Large', 'Extra Large', 'XXL'] }),
      col(4, 'Colour', 'color', { allowed: ['Pink', 'Blue'] }),
      col(5, 'Stock', 'stock'),
      col(6, 'Selling Price', 'price'),
    ],
  };
  const { rows, report } = await fillRows('u', template, 'meesho', [{
    draftId, results: { general: { productTitle: { values: ['Pink kurti'] }, category: { values: ['Women > Kurtis'] } } }, imageUrl: null,
    inventory: { sellingPrice: 499, mrp: 999 }, variants, styleId: 'SA-A8B9C0D1', photoUrl: (id) => `https://img/${id}`,
  }], {}, { useCacheAndAi: false });
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.cells[1].value), variants.map((v) => v.sku));
  assert.ok(rows.every((r) => r.cells[2].value === 'SA-A8B9C0D1'), 'same group id on every size');
  assert.deepEqual(rows.map((r) => r.cells[3].value), ['Small', 'Medium', 'Large', 'Extra Large', 'XXL']);
  assert.ok(rows.every((r) => r.cells[4].value === 'Pink' && r.cells[5].value === '5' && r.cells[6].value === '499'));
  assert.deepEqual(rows.map((r) => r.variantLabel), KURTI_SIZES.map((s) => `Pink / ${s}`));
  assert.equal(new Set(rows.map((r) => r.rowKey)).size, 5);
  assert.equal(report.filledPercent, 100);

  const { sizeSpellings } = await import('../bulk/fill.js');
  assert.ok(sizeSpellings('UK 7').includes('7'));
  assert.ok(sizeSpellings('2-3Y').includes('2-3 Years'));
  assert.ok(sizeSpellings('Free Size').includes('Free'));
});

// ---------------------------------------------------------------- Amazon parent + children (fake Amazon)

function fakeAmazon(existingSkus: string[] = []) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const schema = {
    required: ['item_name', 'brand'],
    properties: {
      item_name: {}, brand: {}, size: {}, color: {}, purchasable_offer: {}, fulfillment_availability: {}, main_product_image_locator: {},
      parentage_level: {}, child_parent_sku_relationship: {},
      variation_theme: { items: { properties: { name: { enum: ['SIZE_NAME', 'COLOR_NAME', 'SIZE_NAME/COLOR_NAME'] } } } },
    },
  };
  spApi.setSpApiFetchForTests(async (_uid, path, init) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (path.startsWith('/definitions/')) return json(200, { schema: { link: { resource: 'https://schema.example/KURTA.json' } } });
    if (path === 'https://schema.example/KURTA.json') return json(200, schema);
    const sku = decodeURIComponent(path.split('?')[0].split('/').pop()!);
    if (method === 'GET') return existingSkus.includes(sku) ? json(200, { sku }) : json(404, { errors: [{ code: 'NOT_FOUND' }] });
    if (method === 'PUT') return json(200, { sku, status: path.includes('VALIDATION_PREVIEW') ? 'VALID' : 'ACCEPTED', issues: [] });
    if (method === 'PATCH') return json(200, { sku, status: 'ACCEPTED', issues: [] });
    return json(500, {});
  });
  return calls;
}

async function sizedListing(api: any) {
  const created = await api('POST', '/listings', { name: 'Pink cotton kurti', sellingPrice: 499, mrp: 999, priceINR: '₹499', variants: kurtiVariants() });
  return created.body;
}

test('Amazon TEST push: 1 parent + 5 sizes, validated first, SA-TEST SKUs, stock 0 (inactive)', async () => {
  const { uid, api } = await newSeller();
  await common.MarketplaceConnection.create({ uid, marketplace: 'amazon', status: 'connected', sellingPartnerId: 'SELLER1' });
  const listing = await sizedListing(api);
  const calls = fakeAmazon();
  const attributes = { item_name: [{ value: 'Pink kurti', language_tag: 'en_IN' }], brand: [{ value: 'Rangoli', language_tag: 'en_IN' }], purchasable_offer: [{ bogus: true }] };
  const res = await api('POST', `/marketplace-connections/amazon/create-variations/${listing.id}`, { productType: 'KURTA', attributes, test: true });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.theme, 'SIZE_NAME/COLOR_NAME');
  assert.equal(res.body.children.length, 5);

  const previews = calls.filter((c) => c.method === 'PUT' && c.path.includes('VALIDATION_PREVIEW'));
  const creates = calls.filter((c) => c.method === 'PUT' && !c.path.includes('VALIDATION_PREVIEW'));
  assert.equal(previews.length, 6, 'parent + 5 children validated first');
  assert.equal(creates.length, 6);
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 0, 'never patches an existing listing');
  const firstCreate = calls.findIndex((c) => c.method === 'PUT' && !c.path.includes('VALIDATION_PREVIEW'));
  assert.ok(calls.slice(firstCreate).every((c) => !c.path.includes('VALIDATION_PREVIEW')), 'all validation happens before any create');
  const skus = creates.map((c) => decodeURIComponent(c.path.split('?')[0].split('/').pop()!));
  assert.ok(skus.every((s) => s.startsWith('SA-TEST-')), skus.join(','));
  const parent = creates[0].body;
  assert.equal(parent.requirements, 'LISTING_PRODUCT_ONLY');
  assert.equal(parent.attributes.parentage_level[0].value, 'parent');
  assert.equal(parent.attributes.purchasable_offer, undefined, 'the parent has no offer');
  for (const child of creates.slice(1).map((c) => c.body)) {
    assert.equal(child.attributes.parentage_level[0].value, 'child');
    assert.equal(child.attributes.child_parent_sku_relationship[0].parent_sku, skus[0]);
    assert.equal(child.attributes.fulfillment_availability[0].quantity, 0, 'test children are never buyable');
    assert.equal(child.attributes.color[0].value, 'Pink');
    assert.equal(child.attributes.purchasable_offer[0].our_price[0].schedule[0].value_with_tax, 499);
  }
  const stored = await common.Listing.findById(listing.id).lean();
  assert.equal(stored.amazonFamily.test, true);
  assert.equal(stored.source, undefined, 'a test family is not treated as live');
  assert.ok(stored.variants.every((v: any) => v.amazonSku?.startsWith('SA-TEST-')));

  // Publishing stock for a test family is refused.
  calls.length = 0;
  const publish = await api('POST', `/marketplace-connections/amazon/publish/${listing.id}`);
  assert.equal(publish.status, 400);
  assert.equal(calls.length, 0);
});

test('Amazon: an existing SKU stops the push before anything is created; per-child errors are shown', async () => {
  const { uid, api } = await newSeller();
  await common.MarketplaceConnection.create({ uid, marketplace: 'amazon', status: 'connected', sellingPartnerId: 'SELLER2' });
  const listing = await sizedListing(api);
  const mSku = listing.variants.find((v: any) => v.size === 'M').sku;
  const calls = fakeAmazon([mSku]);
  const attributes = { item_name: [{ value: 'Pink kurti' }], brand: [{ value: 'Rangoli' }] };
  const res = await api('POST', `/marketplace-connections/amazon/create-variations/${listing.id}`, { productType: 'KURTA', attributes });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'SKU_EXISTS');
  assert.equal(res.body.childErrors[0].label, 'Pink / M');
  assert.equal(calls.filter((c) => c.method !== 'GET' && !c.path.startsWith('/definitions') && !c.path.startsWith('https://')).length, 0, 'nothing sent');

  // Schema check per child: brand is required.
  fakeAmazon();
  const missing = await api('POST', `/marketplace-connections/amazon/create-variations/${listing.id}`, { productType: 'KURTA', attributes: { item_name: [{ value: 'Pink kurti' }] }, test: true });
  assert.equal(missing.status, 422);
  assert.equal(missing.body.childErrors.length, 5);
  assert.match(missing.body.childErrors[0].errors.join(' '), /brand/);
});

test('Amazon: price/stock sync goes to each child SKU', async () => {
  const { uid, api } = await newSeller();
  await common.MarketplaceConnection.create({ uid, marketplace: 'amazon', status: 'connected', sellingPartnerId: 'SELLER3' });
  const listing = await sizedListing(api);
  fakeAmazon();
  const created = await api('POST', `/marketplace-connections/amazon/create-variations/${listing.id}`, { productType: 'KURTA', attributes: { item_name: [{ value: 'K' }], brand: [{ value: 'B' }] } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const calls = fakeAmazon();
  const publish = await api('POST', `/marketplace-connections/amazon/publish/${listing.id}`);
  assert.equal(publish.status, 200, JSON.stringify(publish.body));
  const patches = calls.filter((c) => c.method === 'PATCH');
  assert.equal(patches.length, 5);
  const qty = patches.map((p) => p.body.patches.find((x: any) => x.path.endsWith('fulfillment_availability')).value[0].quantity);
  assert.deepEqual(qty, [5, 5, 5, 5, 5]);
});

// ---------------------------------------------------------------- batch

const photo = (name: string) => `data:image/jpeg;base64,${Buffer.from(`photo:${name}`).toString('base64')}`;

function compactReply(title: string, colours: string[]) {
  const f = (v: string) => ({ v: [v, `${v} alt`], c: 90, r: 'seen' });
  return JSON.stringify({
    general: { productTitle: f(title), category: f('Women > Kurtis'), sku: f('KRT-1'), brand: f('Generic'), hsnCode: f('62044220'), description: f('Soft cotton kurti.'), suggestedSellingPrice: f('499'), suggestedMrp: f('999'), searchTags: f('kurti, cotton') },
    amazon: { seoTitle: f(`${title} for women`), brand: f('Generic') },
    flipkart: { seoTitle: f(title) },
    meesho: { listingTitle: f(title) },
    instagram: { caption: f('New!'), hashtags: { v: ['#kurti #kurti #cotton'], c: 80, r: '' } },
    photoColours: colours,
  });
}

/** Fake Gemini: reads which photos it was sent; behaviour per photo name. */
function fakeGemini(rules: { failOnce?: Set<string>; busy?: Map<string, number>; delayMs?: number } = {}) {
  const state = { calls: 0, running: 0, maxRunning: 0 };
  gemini.setGeminiGeneratorForTests(async (req) => {
    state.calls += 1;
    state.running += 1;
    state.maxRunning = Math.max(state.maxRunning, state.running);
    try {
      await new Promise((r) => setTimeout(r, rules.delayMs ?? 20));
      const names = [req.image, ...(req.extraImages ?? [])].filter(Boolean).map((i) => Buffer.from(i!.data, 'base64').toString().replace('photo:', ''));
      const main = names[0];
      const busyLeft = rules.busy?.get(main) ?? 0;
      if (busyLeft > 0) {
        rules.busy!.set(main, busyLeft - 1);
        throw Object.assign(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"quota"}}'), { status: 429 });
      }
      if (rules.failOnce?.has(main)) {
        rules.failOnce.delete(main);
        return { text: '{"general": ', inputTokens: 10, outputTokens: 5 }; // cut-off reply → not retried automatically
      }
      const colours = names.map((n) => (n.endsWith('-blue') ? 'Blue' : 'Pink'));
      return { text: compactReply(`Kurti ${main}`, colours), inputTokens: 100, outputTokens: 200 };
    } finally {
      state.running -= 1;
    }
  });
  return state;
}

const batchRequest = (items: Array<{ photoCount: number }>, common: Record<string, unknown> = {}) => ({
  prompt: 'Generate the listing.',
  schema: { type: 'object', properties: { general: { type: 'object' }, amazon: { type: 'object' }, flipkart: { type: 'object' }, meesho: { type: 'object' }, instagram: { type: 'object' } }, required: ['general'] },
  items,
  common,
});

async function waitFor(check: () => Promise<boolean>, ms = 15000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timed out');
}

async function uploadAll(api: any, batchId: string, items: any[], names: string[][]) {
  // All photos at once, like the app (3 parallel uploads): slots of one product must not clash.
  const uploads = items.flatMap((item) => names[item.index].map((name, n) => api('PUT', `/batch/${batchId}/items/${item.id}/photos/${n}`, { image: photo(name) })));
  for (const up of await Promise.all(uploads)) assert.equal(up.status, 200, JSON.stringify(up.body));
}

test('batch: 10 photos (2 grouped) → 9 listings; forced failure → Retry; coins = successes; ≤3 at a time', async () => {
  worker.configureBatchWorker({ retryBackoffMs: [10, 20], pauseMs: 100, maxPauseMs: 200, coinsRecheckMs: 100, tickMs: 50 });
  await worker.startBatchWorker();
  const { uid, api } = await newSeller(15);
  const state = fakeGemini({ failOnce: new Set(['p4']), delayMs: 60 });

  // p1 front + p1-blue are one product in two colours; the rest are one photo each.
  const names = [['p1', 'p1-blue'], ['p2'], ['p3'], ['p4'], ['p5'], ['p6'], ['p7'], ['p8'], ['p9']];
  const details = { brand: 'Rangoli', price: 499, mrp: 999, sizes: KURTI_SIZES, stock: Object.fromEntries(KURTI_SIZES.map((s) => [s, 5])), sizePreset: 'alpha', gstHandling: 'inclusive' };

  const tooMany = await api('POST', '/batch', batchRequest(Array.from({ length: 21 }, () => ({ photoCount: 1 }))));
  assert.equal(tooMany.status, 400);

  const created = await api('POST', '/batch', batchRequest(names.map((n) => ({ photoCount: n.length })), details));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const batchId = created.body.id;

  const second = await api('POST', '/batch', batchRequest([{ photoCount: 1 }]));
  assert.equal(second.status, 409, 'one active batch per seller');
  assert.equal(second.body.code, 'ACTIVE_BATCH');

  await uploadAll(api, batchId, created.body.items, names);
  const started = await api('POST', `/batch/${batchId}/start`);
  assert.equal(started.status, 200, JSON.stringify(started.body));

  // "Close the tab and come back": the server keeps going; a fresh GET sees the progress.
  await waitFor(async () => (await api('GET', '/batch/active')).body.batch?.status === 'done');
  const view = (await api('GET', `/batch/${batchId}`)).body.batch;
  assert.equal(view.done, 8);
  assert.equal(view.failed, 1);
  const failed = view.items.find((i: any) => i.status === 'failed');
  assert.equal(failed.index, 3, 'p4 failed once');
  assert.ok(state.maxRunning <= 3, `at most 3 at a time (saw ${state.maxRunning})`);

  let user = await common.User.findById(uid).lean();
  assert.equal(user.coins.free, 15 - 8, 'charged only for the 8 successes');

  const retry = await api('POST', `/batch/${batchId}/items/${failed.id}/retry`);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  await waitFor(async () => (await api('GET', `/batch/${batchId}`)).body.batch.status === 'done');
  const final = (await api('GET', `/batch/${batchId}`)).body.batch;
  assert.equal(final.done, 9);
  assert.equal(final.failed, 0);
  user = await common.User.findById(uid).lean();
  assert.equal(user.coins.free, 15 - 9, 'exactly 9 coins for 9 listings');
  const charges = await common.CoinLedger.find({ uid, type: 'spend' }).lean();
  assert.equal(charges.length, 9);
  assert.equal(new Set(charges.map((c: any) => c.key)).size, 9, 'one charge per product');
  assert.equal(await common.CoinLedger.countDocuments({ uid, type: 'refund' }), 0, 'failures were never charged');

  // The grouped product: two colours × five sizes, each colour with its own photo.
  const grouped = final.items.find((i: any) => i.index === 0);
  assert.equal(grouped.photoUrls.length, 2);
  const variants = grouped.listing.variants;
  assert.equal(variants.length, 10);
  assert.deepEqual([...new Set(variants.map((v: any) => v.colour))], ['Pink', 'Blue']);
  assert.ok(variants.every((v: any) => v.stock === 5 && v.imageIds.length === 1 && v.sku));
  const draft = await common.ListingDraft.findById(grouped.listing.id).lean();
  assert.equal(draft.results.general.brand.values[0], 'Rangoli', 'common brand wins');
  assert.equal(draft.results.general.sellingPrice.values[0], '499');
  assert.equal(draft.results.instagram.hashtags.values[0], '#kurti #cotton', 'hashtags de-duplicated');

  // Review → approve all → add to inventory.
  const approved = await api('POST', `/batch/${batchId}/approve`, {});
  assert.ok(approved.body.batch.items.every((i: any) => i.approved));
  const inv = await api('POST', `/batch/${batchId}/inventory`, {});
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  assert.equal(inv.body.results.filter((r: any) => r.ok).length, 9);
  const listing = await common.Listing.findById(inv.body.results[0].inventoryListingId).lean();
  assert.equal(listing.quantity, 50);
  assert.equal(listing.variants[0].sku, variants[0].sku, 'SKUs carry over from the listing');
  assert.equal(listing.draftId, grouped.listing.id);

  const seen = await api('POST', `/batch/${batchId}/seen`);
  assert.equal(seen.status, 200);
  assert.equal((await api('GET', '/batch/active')).body.batch, null);
});

test('batch: AI busy (429) → automatic retries, then pause — products are never failed or charged', async () => {
  const { uid, api } = await newSeller(5);
  // 5 × 429 for "b1": 3 attempts (1 + 2 retries) → pause; then 2 more → pause again; then OK.
  worker.configureBatchWorker({ pauseMs: 600, maxPauseMs: 1200 });
  const state = fakeGemini({ busy: new Map([['b1', 5]]) });
  const created = await api('POST', '/batch', batchRequest([{ photoCount: 1 }, { photoCount: 1 }]));
  await uploadAll(api, created.body.id, created.body.items, [['b1'], ['b2']]);
  await api('POST', `/batch/${created.body.id}/start`);
  await waitFor(async () => (await common.BatchJob.findById(created.body.id).lean()).status === 'paused');
  const paused = (await api('GET', `/batch/${created.body.id}`)).body.batch;
  assert.equal(paused.status, 'paused');
  assert.equal(paused.pauseReason, 'ai_busy');
  assert.equal(paused.items.find((i: any) => i.index === 0).status, 'queued', 'back in the queue, not failed');
  assert.equal(paused.items.find((i: any) => i.index === 0).coinCharged, false);
  await waitFor(async () => (await common.BatchJob.findById(created.body.id).lean()).status === 'done');
  const done = (await api('GET', `/batch/${created.body.id}`)).body.batch;
  assert.equal(done.done, 2);
  assert.equal(done.failed, 0);
  assert.equal(done.items[0].attempts, 6);
  assert.equal((await common.User.findById(uid).lean()).coins.free, 3);
  assert.ok(state.calls >= 7);
});

test('batch: a restart mid-batch resumes without charging twice', async () => {
  const { uid, api } = await newSeller(5);
  fakeGemini({ delayMs: 200 });
  const created = await api('POST', '/batch', batchRequest([{ photoCount: 1 }, { photoCount: 1 }, { photoCount: 1 }, { photoCount: 1 }]));
  await uploadAll(api, created.body.id, created.body.items, [['r1'], ['r2'], ['r3'], ['r4']]);
  await api('POST', `/batch/${created.body.id}/start`);
  await waitFor(async () => (await common.BatchItem.countDocuments({ batchId: created.body.id, status: 'generating' })) > 0);
  // Simulate the server stopping: the loop stops and an item is left "generating".
  worker.stopBatchWorker();
  await worker.drainBatchWorker();
  await common.BatchItem.updateOne({ batchId: created.body.id, status: 'ready' }, { $set: { status: 'generating' } }); // crashed after the listing was made
  await worker.startBatchWorker();
  await waitFor(async () => (await common.BatchJob.findById(created.body.id).lean()).status === 'done');
  assert.equal((await common.User.findById(uid).lean()).coins.free, 1, '4 listings, 4 coins');
  assert.equal(await common.ListingDraft.countDocuments({ uid, batchId: created.body.id }), 4, 'no duplicate listings');
});

test('batch: not enough coins → 402 with the numbers; cancel an upload charges nothing', async () => {
  const { api } = await newSeller(2);
  const res = await api('POST', '/batch', batchRequest([{ photoCount: 1 }, { photoCount: 1 }, { photoCount: 1 }]));
  assert.equal(res.status, 402);
  assert.equal(res.body.needed, 3);
  assert.equal(res.body.balance, 2);
  const ok = await api('POST', '/batch', batchRequest([{ photoCount: 1 }, { photoCount: 1 }]));
  assert.equal(ok.status, 201);
  const early = await api('POST', `/batch/${ok.body.id}/start`);
  assert.equal(early.status, 400, 'photos missing');
  const cancel = await api('POST', `/batch/${ok.body.id}/cancel`);
  assert.equal(cancel.status, 200);
  assert.equal((await api('POST', '/batch', batchRequest([{ photoCount: 1 }]))).status, 201, 'can start again after cancelling');
});

test('product photos and size charts', async () => {
  const { uid, api } = await newSeller();
  const img = await common.ProductImage.create({ uid, data: photo('x') });
  const res = await fetch(`${base}/images/${img._id}.jpg`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), 'photo:x');

  const saved = await api('PUT', '/size-charts', { brand: 'Rangoli', category: 'Women > Kurtis', unit: 'in', measures: ['Chest', 'Length'], rows: [{ size: 'M', values: ['38', '44'] }, { size: 'L', values: ['40', '44'] }] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const again = await api('GET', `/size-charts?brand=${encodeURIComponent('rangoli')}&category=${encodeURIComponent('Women > Kurtis')}`);
  assert.deepEqual(again.body.chart.rows, [{ size: 'M', values: ['38', '44'] }, { size: 'L', values: ['40', '44'] }]);
  const bad = await api('PUT', '/size-charts', { brand: 'R', category: 'K', measures: ['Chest'], rows: [{ size: 'M', values: ['big'] }] });
  assert.equal(bad.status, 400);
});
