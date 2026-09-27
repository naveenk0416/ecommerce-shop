/**
 * Coin wallet integration tests against a throwaway in-memory MongoDB, with Gemini and Razorpay
 * replaced by fakes — no real AI, payment or marketplace call is ever made. The suite aborts if the
 * database isn't local.
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
let gemini: any;
let walletApi: any;
let coins: any;
let jwt: any;
const RAZORPAY_SECRET = 'test-razorpay-secret';

/** What the fake Gemini saw, and what it should answer next. */
const geminiCalls: Array<{ model: string; prompt: string; maxOutputTokens?: number }> = [];
let geminiReply: (prompt: string) => string = () => JSON.stringify({ general: {} });
let geminiFails = false;

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['MONGO_URI'] = mongo.getUri();
  process.env['VERCEL'] = '1';
  process.env['JWT_SECRET'] = 'test-secret';
  process.env['RAZORPAY_KEY_SECRET'] = RAZORPAY_SECRET;
  process.env['RAZORPAY_KEY_ID'] = 'rzp_test_dummy';
  process.env['COIN_PACKS_ENABLED'] = 'false';
  // Empty (not deleted): dotenv never overrides a variable that already exists, so the real keys
  // in backend/.env can't be picked up. No mail, AI or payment request leaves this machine.
  process.env['GEMINI_API_KEY'] = '';
  process.env['RESEND_API_KEY'] = '';
  process.env['TRUST_PROXY'] = '';

  common = await import('./common.js');
  await common.ensureConnected();
  const mongoose = (await import('mongoose')).default;
  assert.match(mongoose.connection.host, /^(127\.0\.0\.1|localhost)$/, 'refusing to run against a non-local database');

  gemini = await import('../utils/gemini.js');
  gemini.setGeminiGeneratorForTests(async (req: any) => {
    geminiCalls.push({ model: req.model, prompt: req.prompt, maxOutputTokens: req.maxOutputTokens });
    if (geminiFails) throw new Error('{"error":{"status":"UNAVAILABLE","message":"overloaded"}}');
    return { text: geminiReply(req.prompt), inputTokens: 1000, outputTokens: 200 };
  });
  walletApi = await import('./wallet.js');
  walletApi.setOrderCreatorForTests(async (amount: number) => ({ id: `order_${crypto.randomBytes(6).toString('hex')}`, amount, currency: 'INR' }));
  coins = await import('../config/coins.js');
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
  geminiFails = false;
  geminiReply = () => JSON.stringify({ general: {} });
  coins.setPacksEnabledForTests(false);
});

type Opts = { token?: string; device?: string; ip?: string };

async function api(method: string, path: string, body?: unknown, opts: Opts = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.device) headers['X-Device-Id'] = opts.device;
  if (opts.ip) headers['X-Forwarded-For'] = opts.ip;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* CSV */ }
  return { status: res.status, data, headers: res.headers };
}

let phoneSeq = 0;
function nextPhone(): string {
  phoneSeq += 1;
  return `98${String(76500000 + phoneSeq).padStart(8, '0')}`;
}

/** Registers through the real /register route, then verifies the email through /verify-email. */
async function signUp(extra: Record<string, unknown> = {}, opts: Opts = {}) {
  const email = `seller${crypto.randomBytes(4).toString('hex')}@example.test`;
  const reg = await api('POST', '/register', {
    email, password: 'Str0ng!Pass', displayName: 'Test Seller', phoneNumber: nextPhone(),
    state: 'Telangana', city: 'Hyderabad', termsAccepted: true, catalogSizeBand: '11-50', ...extra,
  }, opts);
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  const raw = crypto.randomBytes(16).toString('hex');
  await common.User.updateOne({ email }, {
    $set: { emailVerificationTokenHash: crypto.createHash('sha256').update(raw).digest('hex'), emailVerificationExpires: new Date(Date.now() + 3600e3) },
  });
  const verified = await api('POST', '/verify-email', { token: raw }, opts);
  assert.equal(verified.status, 200, JSON.stringify(verified.data));
  const user = await common.User.findOne({ email }).lean();
  return { token: verified.data.token as string, uid: user._id.toString(), email };
}

/** An existing, verified account created directly (e.g. from before the wallet existed). */
async function existingUser(fields: Record<string, unknown> = {}) {
  const user = await new common.User({ email: `old${crypto.randomBytes(4).toString('hex')}@example.test`, passwordHash: 'x', emailVerified: true, ...fields }).save();
  return { uid: user._id.toString(), token: jwt.sign({ uid: user._id.toString(), email: user.email }, 'test-secret') as string };
}

const wallet = async (token: string) => (await api('GET', '/wallet', undefined, { token })).data;
const total = async (token: string) => (await wallet(token)).balance.total;
const listingCall = (token: string, opts: Opts = {}) => api('POST', '/ai/listing', { prompt: 'Describe this product', schema: { type: 'object' }, image: { data: 'aGVsbG8=', mimeType: 'image/jpeg' } }, { token, ...opts });

// ---- Check 1 ----

test('sign-up requires the product-count answer', async () => {
  const res = await api('POST', '/register', {
    email: 'nocatalog@example.test', password: 'Str0ng!Pass', displayName: 'X', phoneNumber: nextPhone(),
    state: 'Telangana', city: 'Hyderabad', termsAccepted: true,
  });
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'CATALOG_SIZE_REQUIRED');
});

test('new verified seller gets the 10-coin welcome bonus once (+2 for the mobile number given at sign-up)', async () => {
  const { token, uid } = await signUp();
  const w = await wallet(token);
  const welcome = await common.CoinLedger.find({ uid, type: 'welcome_bonus' }).lean();
  assert.equal(welcome.length, 1);
  assert.equal(welcome[0].amount, 10);
  assert.equal(w.balance.total, 12);
  assert.deepEqual(w.bonuses.filter((b: any) => b.done).map((b: any) => b.id).sort(), ['mobile', 'welcome']);
  await wallet(token);
  assert.equal(await total(token), 12, 'calling the wallet again never re-grants');
  const user = await common.User.findById(uid).lean();
  assert.equal(user.catalogSizeBand, '11-50');
});

test('existing sellers keep what they have and get the welcome once; nothing is taken away', async () => {
  const { uid, token } = await existingUser({ coins: { free: 15, paid: 0 }, walletInitAt: new Date() });
  await common.CoinLedger.create({ uid, type: 'welcome_bonus', amount: 15, free: 15, key: 'welcome', reason: 'Old welcome' });
  assert.equal(await total(token), 15);
});

test('month change tops the free balance up to 3, never above, and only once a month', async () => {
  const { uid, token } = await existingUser();
  await wallet(token); // welcome 10
  await common.User.updateOne({ _id: uid }, { $set: { 'coins.free': 1, lastTopupMonth: '2020-01' } });
  let w = await wallet(token);
  assert.equal(w.balance.free, 3);
  const topups = await common.CoinLedger.find({ uid, type: 'monthly_topup' }).lean();
  assert.equal(topups.length, 1);
  assert.equal(topups[0].amount, 2);
  w = await wallet(token);
  assert.equal(w.balance.free, 3, 'second call in the same month adds nothing');

  await common.User.updateOne({ _id: uid }, { $set: { 'coins.free': 5, lastTopupMonth: '2020-02' } });
  w = await wallet(token);
  assert.equal(w.balance.free, 5, 'a balance above 3 is not topped up (and not reduced)');
});

// ---- Check 2 ----

test('saving a mobile number gives +2 once; first Save to Inventory gives +3 once', async () => {
  const { uid, token } = await existingUser();
  assert.equal(await total(token), 10);
  let res = await api('PATCH', `/users/${uid}`, { phoneNumber: nextPhone() }, { token });
  assert.equal(res.status, 200);
  assert.equal(await total(token), 12);
  res = await api('PATCH', `/users/${uid}`, { phoneNumber: nextPhone() }, { token });
  assert.equal(await total(token), 12, 'changing the number again gives nothing');

  res = await api('POST', '/listings', { name: 'Kurti', sellingPrice: 499, costPrice: 200, quantity: 4 }, { token });
  assert.equal(res.status, 200);
  assert.equal(await total(token), 15);
  await api('POST', '/listings', { name: 'Kurti 2', sellingPrice: 499, costPrice: 200, quantity: 4 }, { token });
  assert.equal(await total(token), 15, 'second save gives nothing');
  const w = await wallet(token);
  assert.equal(w.bonuses.find((b: any) => b.id === 'firstInventorySave').done, true);
  assert.equal(w.bonuses.find((b: any) => b.id === 'firstPublish').done, false);
});

// ---- Coins for AI listings ----

test('an AI listing costs 1 coin; a failed call is refunded; at 0 coins it is refused', async () => {
  const { uid, token } = await existingUser();
  await common.User.updateOne({ _id: uid }, { $set: { 'coins.free': 1 } });
  await common.CoinLedger.create({ uid, type: 'welcome_bonus', amount: 1, free: 1, key: 'welcome', reason: 'x' });
  await common.User.updateOne({ _id: uid }, { $set: { walletInitAt: new Date(), lastTopupMonth: coins.monthKey() } });

  geminiFails = true;
  let res = await listingCall(token);
  assert.equal(res.status, 502);
  assert.match(res.data.error, /refunded/);
  assert.equal(await total(token), 1, 'failed call refunded');

  geminiFails = false;
  res = await listingCall(token);
  assert.equal(res.status, 200);
  assert.equal(res.data.balance.free + res.data.balance.paid, 0);

  res = await listingCall(token);
  assert.equal(res.status, 402);
  assert.equal(res.data.code, 'OUT_OF_COINS');
  assert.ok(res.data.wallet.nextTopUpAt, 'out-of-coins response carries the next top-up date');
  const user = await common.User.findById(uid).lean();
  assert.ok(user.freeExhaustedAt, 'records that the free coins were used up');
});

// ---- Check 3 ----

test('referral: referred seller verifies and creates a listing → both +10, once', async () => {
  const referrer = await signUp({}, { device: 'device-referrer-0001' });
  const code = (await wallet(referrer.token)).referral.code;
  assert.match(code, /^[A-Z0-9]{7}$/);
  const before = await total(referrer.token);

  const referred = await signUp({ attribution: { utm_campaign: 'surat_hindi', ref: code } }, { device: 'device-referred-0002' });
  const referredStart = await total(referred.token);
  assert.equal((await listingCall(referred.token, { device: 'device-referred-0002' })).status, 200);
  assert.equal(await total(referrer.token), before + 10);
  assert.equal(await total(referred.token), referredStart - 1 + 10);

  await listingCall(referred.token, { device: 'device-referred-0002' });
  assert.equal(await total(referrer.token), before + 10, 'a second listing pays nothing more');
  const stored = await common.User.findById(referred.uid).lean();
  assert.equal(stored.attribution.ref, code, 'ref code stored with the UTM attribution');
  assert.equal(stored.attribution.utm_campaign, 'surat_hindi');

  // Deleted within 7 days → the referrer's reward is reversed with a ledger entry.
  await common.User.updateOne({ _id: referred.uid }, { $set: { passwordHash: await (await import('bcryptjs')).default.hash('Str0ng!Pass', 4) } });
  const del = await api('DELETE', '/me', { password: 'Str0ng!Pass' }, { token: referred.token });
  assert.equal(del.status, 200);
  assert.equal(await total(referrer.token), before);
  assert.equal(await common.CoinLedger.countDocuments({ uid: referrer.uid, type: 'referral_reversal' }), 1);
});

test('referral from the same device (or same network) gives nothing', async () => {
  const referrer = await signUp({}, { device: 'shared-device-0003' });
  const code = (await wallet(referrer.token)).referral.code;
  const before = await total(referrer.token);
  const referred = await signUp({ attribution: { ref: code } }, { device: 'shared-device-0003' });
  const referredBefore = await total(referred.token);
  await listingCall(referred.token);
  assert.equal(await total(referrer.token), before);
  assert.equal(await total(referred.token), referredBefore - 1);
  const stored = await common.User.findById(referred.uid).lean();
  assert.equal(stored.referral.status, 'blocked');
  assert.equal(stored.referral.reason, 'same_device');

  process.env['TRUST_PROXY'] = '1';
  try {
    const r2 = await signUp({}, { device: 'net-referrer-0004', ip: '203.0.113.7' });
    const code2 = (await wallet(r2.token)).referral.code;
    const referred2 = await signUp({ attribution: { ref: code2 } }, { device: 'net-referred-0005', ip: '203.0.113.7' });
    await listingCall(referred2.token);
    assert.equal((await common.User.findById(referred2.uid).lean()).referral.reason, 'same_ip');
  } finally {
    process.env['TRUST_PROXY'] = '';
  }
});

// ---- Check 4 ----

test('free field fixes: 10 per listing, never charge coins; failed calls do not count; 11th blocked', async () => {
  const { uid, token } = await existingUser();
  const draft = await common.ListingDraft.create({ uid, title: 'Kurti' });
  const coinsBefore = await total(token);
  geminiReply = () => JSON.stringify({ value: 'Better title' });

  geminiFails = true;
  const failed = await api('POST', '/ai/field-fix', { listingKey: draft._id.toString(), tab: 'amazon', fieldKey: 'seoTitle', label: 'SEO Title', value: 'kurti' }, { token });
  assert.equal(failed.status, 502);
  assert.equal(failed.data.assists.left, 10, 'failed call did not use an assist');
  geminiFails = false;

  for (let i = 0; i < 10; i++) {
    const res = await api('POST', '/ai/field-fix', { listingKey: draft._id.toString(), tab: 'amazon', fieldKey: 'seoTitle', label: 'SEO Title', value: 'kurti' }, { token });
    assert.equal(res.status, 200, `fix ${i + 1}`);
    assert.equal(res.data.assists.left, 9 - i);
  }
  const eleventh = await api('POST', '/ai/field-fix', { listingKey: draft._id.toString(), tab: 'amazon', fieldKey: 'seoTitle', label: 'SEO Title', value: 'kurti' }, { token });
  assert.equal(eleventh.status, 429);
  assert.equal(eleventh.data.code, 'ASSIST_LIMIT');
  assert.equal(await total(token), coinsBefore, 'coins unchanged');
  const lastCall = geminiCalls[geminiCalls.length - 1];
  assert.equal(lastCall.model, 'gemini-3.1-flash-lite');
  assert.ok((lastCall.maxOutputTokens ?? 0) <= 500);

  const brand = await api('POST', '/ai/field-fix', { listingKey: draft._id.toString(), tab: 'amazon', fieldKey: 'brand', label: 'Brand', value: 'Generic' }, { token });
  assert.equal(brand.data.code, 'BLOCKED_FIELD');
});

test('Fill empty fields with AI: 3 per listing per marketplace; 4th blocked; coins unchanged', async () => {
  const { uid, token } = await existingUser();
  const listing = await common.Listing.create({ uid, name: 'Cotton kurti', description: 'Blue cotton kurti' });
  const coinsBefore = await total(token);
  geminiReply = () => JSON.stringify({ color: 'Blue' });
  const body = { listingId: listing._id.toString(), marketplace: 'amazon', fields: [{ key: 'color', label: 'Color', kind: 'text' }] };
  for (let i = 0; i < 3; i++) assert.equal((await api('POST', '/ai/marketplace-autofill', body, { token })).status, 200);
  const fourth = await api('POST', '/ai/marketplace-autofill', body, { token });
  assert.equal(fourth.status, 429);
  const flipkart = await api('POST', '/ai/marketplace-autofill', { ...body, marketplace: 'flipkart' }, { token });
  assert.equal(flipkart.status, 200, 'the limit is per marketplace');
  assert.equal(await total(token), coinsBefore);
});

test('daily cap: 60 free assists per seller per day across listings', async () => {
  const { uid, token } = await existingUser();
  geminiReply = () => JSON.stringify({ value: 'x' });
  const drafts = await Promise.all(Array.from({ length: 7 }, () => common.ListingDraft.create({ uid })));
  let ok = 0;
  let blocked: any = null;
  for (const draft of drafts) {
    for (let i = 0; i < 10; i++) {
      const res = await api('POST', '/ai/field-fix', { listingKey: draft._id.toString(), tab: 'general', fieldKey: 'description', label: 'Description', value: 'x' }, { token });
      if (res.status === 200) ok += 1;
      else blocked = res.data;
    }
  }
  assert.equal(ok, 60);
  assert.equal(blocked.limit, 'day');
});

// ---- Check 5 ----

test('Fill empty fields with AI never fills brand, MRP, origin, manufacturer, weight, dimensions or GTIN', async () => {
  const { uid, token } = await existingUser();
  const listing = await common.Listing.create({ uid, name: 'Cotton kurti' });
  const everything = {
    brand: 'Fabindia', maximum_retail_price: 999, country_of_origin: 'IN', manufacturer: 'ACME', item_weight__value: 200,
    item_dimensions__length: 30, externally_assigned_product_identifier__value: '8901234567890', color: 'Blue', material: 'Cotton',
    packer_contact_information: 'x', supplier_declared_dg_hz_regulation: 'not_applicable', net_quantity: 1,
  };
  geminiReply = () => JSON.stringify(everything);
  const fields = Object.keys(everything).map((key) => ({ key, label: key, kind: typeof (everything as any)[key] === 'number' ? 'number' : 'text' }));
  const res = await api('POST', '/ai/marketplace-autofill', { listingId: listing._id.toString(), marketplace: 'amazon', fields }, { token });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.data.values).sort(), ['color', 'material']);
  for (const key of ['brand', 'maximum_retail_price', 'country_of_origin', 'manufacturer', 'item_weight__value', 'item_dimensions__length', 'externally_assigned_product_identifier__value', 'packer_contact_information', 'supplier_declared_dg_hz_regulation', 'net_quantity']) {
    assert.ok(res.data.blocked.includes(key), `${key} blocked`);
  }
  const fieldLines = geminiCalls[geminiCalls.length - 1].prompt.split('\n').filter((line) => line.startsWith('- '));
  assert.deepEqual(fieldLines.map((line) => line.slice(2).split(':')[0]), ['color', 'material'], 'blocked fields are not even sent to the AI');
});

// ---- Checks 6 and 7 ----

test('packs OFF: no pack can be bought; "Notify me" clicks are recorded with the balance', async () => {
  const { uid, token } = await existingUser();
  const w = await wallet(token);
  assert.equal(w.packs.enabled, false);
  assert.deepEqual(w.packs.regular, []);
  assert.equal(w.packs.starter, null);
  assert.equal((await api('POST', '/wallet/packs/pack_30/order', {}, { token })).status, 403);
  assert.equal((await api('POST', '/wallet/notify-me', {}, { token })).status, 200);
  const click = await common.PackInterest.findOne({ uid }).lean();
  assert.equal(click.balance, 10);
  assert.ok(click.createdAt);
  assert.equal((await wallet(token)).notifyRequested, true);
});

test('packs ON: at 0 coins the ₹49 starter offer runs 48h; buying it once works, a second time is refused', async () => {
  coins.setPacksEnabledForTests(true);
  const { uid, token } = await existingUser();
  await wallet(token);
  let w = await wallet(token);
  assert.equal(w.packs.starter, null, 'no offer while coins remain');
  assert.equal(w.packs.minPriceInr, 99);

  await common.User.updateOne({ _id: uid }, { $set: { 'coins.free': 1 } });
  assert.equal((await listingCall(token)).status, 200);
  w = await wallet(token);
  assert.ok(w.packs.starter, 'starter offer shown at 0');
  assert.equal(w.packs.starter.priceInr, 49);
  assert.equal(w.packs.starter.coins, 20);
  const hours = (new Date(w.packs.starter.expiresAt).getTime() - Date.now()) / 3600e3;
  assert.ok(hours > 47.9 && hours <= 48, `offer lasts 48h (got ${hours})`);
  assert.equal(w.packs.minPriceInr, 49);

  const order = await api('POST', '/wallet/packs/starter/order', {}, { token });
  assert.equal(order.status, 200);
  assert.equal(order.data.amount, 4900);
  const paymentId = 'pay_test_1';
  const signature = crypto.createHmac('sha256', RAZORPAY_SECRET).update(`${order.data.orderId}|${paymentId}`).digest('hex');
  const bad = await api('POST', '/wallet/packs/verify', { razorpay_order_id: order.data.orderId, razorpay_payment_id: paymentId, razorpay_signature: 'nope' }, { token });
  assert.equal(bad.status, 400, 'a forged signature credits nothing');
  const paid = await api('POST', '/wallet/packs/verify', { razorpay_order_id: order.data.orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }, { token });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.wallet.balance.paid, 20);
  const replay = await api('POST', '/wallet/packs/verify', { razorpay_order_id: order.data.orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }, { token });
  assert.equal(replay.data.wallet.balance.paid, 20, 'verifying the same payment twice credits once');

  const again = await api('POST', '/wallet/packs/starter/order', {}, { token });
  assert.equal(again.status, 409);
  w = await wallet(token);
  assert.equal(w.packs.starter, null);

  const regular = await api('POST', '/wallet/packs/pack_30/order', {}, { token });
  assert.equal(regular.data.amount, 9900, 'price comes from config');
});

// ---- Check 9 ----

test('time saved = (AI listings × 20 + auto-fills × 10 + GST lookups × 2) / 60, rounded to 0.5', async () => {
  const { uid, token } = await existingUser();
  await wallet(token);
  for (let i = 0; i < 3; i++) await listingCall(token);
  const listing = await common.Listing.create({ uid, name: 'x' });
  geminiReply = () => JSON.stringify({ color: 'Red' });
  await api('POST', '/ai/marketplace-autofill', { listingId: listing._id.toString(), marketplace: 'amazon', fields: [{ key: 'color', label: 'Color', kind: 'text' }] }, { token });
  await api('GET', '/gst/rate?hsn=62044220&price=499', undefined, { token });
  await api('GET', '/gst/rate?hsn=62044220&price=599', undefined, { token }); // same HSN, same day: counted once
  await new Promise((r) => setTimeout(r, 200));
  const w = await wallet(token);
  // 3×20 + 1×10 + 1×2 = 72 min = 1.2 h → 1.0
  assert.equal(w.timeSaved.minutes, 72);
  assert.equal(w.timeSaved.hours, 1);
  assert.deepEqual(w.timeSaved.counts, { aiListings: 3, autofills: 1, gstLookups: 1 });
});

// ---- Check 8 ----

test('admin stats: catalog-size distribution, activation, CSV without emails; non-admins refused', async () => {
  await signUp({ attribution: { utm_campaign: 'delhi_hindi' } });
  const admin = await existingUser({ role: 'ADMIN' });
  const seller = await existingUser();
  assert.equal((await api('GET', '/admin/stats', undefined, { token: seller.token })).status, 403);
  const stats = await api('GET', '/admin/stats', undefined, { token: admin.token });
  assert.equal(stats.status, 200);
  assert.ok(stats.data.signups > 5);
  assert.ok(stats.data.catalogSizeBand['11-50'] >= 3);
  assert.ok(stats.data.activationPct > 0);
  assert.ok('week2RetentionPct' in stats.data);
  assert.ok(stats.data.aiCost.byPurpose.some((r: any) => r.purpose === 'field_fix'));
  assert.ok(stats.data.aiCost.byPurpose.some((r: any) => r.purpose === 'marketplace_autofill'));
  const filtered = await api('GET', '/admin/stats?campaign=delhi_hindi', undefined, { token: admin.token });
  assert.equal(filtered.data.signups, 1);

  const csv = await api('GET', '/admin/stats.csv?type=users', undefined, { token: admin.token });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type') || '', /text\/csv/);
  assert.ok(String(csv.data).startsWith('userId,'));
  assert.ok(!String(csv.data).includes('@'), 'no emails in the CSV');
  assert.ok(!/passwordHash|token/i.test(String(csv.data)));
  const summary = await api('GET', '/admin/stats.csv?type=summary', undefined, { token: admin.token });
  assert.match(String(summary.data), /activationPct/);
});
