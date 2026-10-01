/**
 * Short sign-up, split welcome bonus, email checks, abuse limits, Google sign-in, onboarding card,
 * guest listing and funnel — against a throwaway in-memory MongoDB. Gemini, Google, DNS and email
 * are fakes; nothing leaves this machine.
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
let auth: any;
let emailCheck: any;
let jwt: any;
const mails: Array<{ to: string; subject: string; html: string }> = [];
let geminiReply: () => string;

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['MONGO_URI'] = mongo.getUri();
  process.env['VERCEL'] = '1';
  process.env['JWT_SECRET'] = 'test-secret';
  process.env['REGISTER_RATE_LIMIT'] = '1000';
  // Payments on, so the pack-order test reaches the "verify your email first" rule.
  process.env['PAYMENTS_ENABLED'] = 'true';
  // Real client IPs from X-Forwarded-For, so the per-network limits can be tested.
  process.env['TRUST_PROXY'] = '1';
  for (const key of ['GEMINI_API_KEY', 'RESEND_API_KEY', 'GOOGLE_CLIENT_ID', 'COIN_PACKS_ENABLED']) process.env[key] = '';

  common = await import('./common.js');
  await common.ensureConnected();
  const mongoose = (await import('mongoose')).default;
  assert.match(mongoose.connection.host, /^(127\.0\.0\.1|localhost)$/, 'refusing to run against a non-local database');

  (await import('../utils/mailer.js')).setMailSenderForTests(async (m: any) => { mails.push(m); });
  emailCheck = await import('../utils/email-check.js');
  emailCheck.setMxResolverForTests(async (domain: string) => domain !== 'nomx-domain.test');
  (await import('../utils/gemini.js')).setGeminiGeneratorForTests(async () => ({ text: geminiReply(), inputTokens: 1000, outputTokens: 500 }));
  auth = await import('./auth.js');
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

const field = (v: string) => ({ v: [v, `${v} alt`], c: 90, r: 'From photo.' });
beforeEach(() => {
  geminiReply = () => JSON.stringify({
    general: { productTitle: field('Pink cotton kurti'), hsnCode: field('6104'), category: field('Kurtis') },
    amazon: { seoTitle: field('Women Pink Cotton Straight Kurti'), bulletPoint1: field('SOFT COTTON: breathable'), bulletPoint2: field('EASY CARE: machine wash'), bulletPoint3: field('FIT: straight') },
    flipkart: { seoTitle: field('Pink Kurti') }, meesho: { listingTitle: field('Kurti') }, instagram: { caption: field('New kurti!') },
  });
});

type Opts = { token?: string; device?: string; ip?: string };
async function api(method: string, path: string, body?: unknown, opts: Opts = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.device) headers['X-Device-Id'] = opts.device;
  headers['X-Forwarded-For'] = opts.ip ?? `203.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data };
}

let phoneSeq = 0;
const nextPhone = () => `97${String(10000000 + ++phoneSeq).padStart(8, '0')}`;
const newDevice = () => `dev-${crypto.randomBytes(6).toString('hex')}`;
const newEmail = () => `seller${crypto.randomBytes(4).toString('hex')}@realmail.test`;

async function register(extra: Record<string, unknown> = {}, opts: Opts = {}) {
  return api('POST', '/register', { email: newEmail(), password: 'Str0ng!Pass', displayName: 'Test Seller', phoneNumber: nextPhone(), termsAccepted: true, ...extra }, { device: newDevice(), ...opts });
}

async function verify(uid: string) {
  const raw = crypto.randomBytes(16).toString('hex');
  await common.User.updateOne({ _id: uid }, { $set: { emailVerificationTokenHash: crypto.createHash('sha256').update(raw).digest('hex'), emailVerificationExpires: new Date(Date.now() + 3600e3) } });
  return api('POST', '/verify-email', { token: raw });
}

const walletOf = async (token: string) => (await api('GET', '/wallet', undefined, { token })).data;
const ledger = async (uid: string) => (await common.CoinLedger.find({ uid }).sort({ createdAt: 1 }).lean()).map((r: any) => [r.reason, r.amount]);

// ---- 1 + 3: short sign-up, straight in with 3 coins, 10 after verification ----

test('short sign-up: signed in right away with 3 coins; verifying adds 7 (total 10)', async () => {
  const res = await register();
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(res.data.token, 'signed in straight away');
  assert.equal(res.data.user.emailVerified, false);
  const uid = res.data.user.uid;
  let w = await walletOf(res.data.token);
  assert.equal(w.balance.total, 3);
  assert.equal(w.pendingWelcome, 7);
  assert.equal(w.emailVerified, false);
  assert.deepEqual(await ledger(uid), [['Welcome bonus (part 1)', 3]]);
  assert.equal(mails.filter((m) => /Verify your SellAssist/.test(m.subject)).length >= 1, true);

  const v = await verify(uid);
  assert.equal(v.status, 200);
  w = await walletOf(res.data.token);
  // +2 for the mobile number given at sign-up lands with verification too.
  assert.deepEqual(await ledger(uid), [['Welcome bonus (part 1)', 3], ['Email verified', 7], ['Mobile number added to your profile', 2]]);
  assert.equal(w.balance.total, 12);
  const welcomeTotal = (await common.CoinLedger.find({ uid, type: 'welcome_bonus' }).lean()).reduce((s: number, r: any) => s + r.amount, 0);
  assert.equal(welcomeTotal, 10, 'welcome stays 10 in total');
});

test('unverified accounts can log in', async () => {
  const email = newEmail();
  await register({ email });
  const login = await api('POST', '/login', { email, password: 'Str0ng!Pass' });
  assert.equal(login.status, 200);
  assert.ok(login.data.token);
});

test('sign-up validation: name, mobile and terms required; phone must be unique', async () => {
  assert.equal((await register({ displayName: '' })).data.code, 'NAME_REQUIRED');
  assert.equal((await register({ phoneNumber: '12345' })).data.code, 'INVALID_PHONE');
  assert.equal((await register({ termsAccepted: false })).status, 400);
  const phone = nextPhone();
  await register({ phoneNumber: phone });
  const dup = await register({ phoneNumber: phone });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.code, 'PHONE_TAKEN');
  assert.equal(dup.data.error, 'This number is already registered. Login instead?');
});

// ---- 4b: dummy emails ----

test('disposable email (mailinator.com) is rejected and logged', async () => {
  const res = await register({ email: `x${crypto.randomBytes(3).toString('hex')}@mailinator.com` });
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'DISPOSABLE_EMAIL');
  assert.equal(res.data.error, 'Please use your real email address.');
  assert.ok(await common.AbuseEvent.exists({ type: 'disposable_email', emailDomain: 'mailinator.com' }));
});

test('typo domain gets "Did you mean gmail.com?"; domain without MX is rejected', async () => {
  const typo = await register({ email: 'user@gmial.com' });
  assert.equal(typo.status, 400);
  assert.equal(typo.data.code, 'EMAIL_TYPO');
  assert.equal(typo.data.error, 'Did you mean gmail.com?');
  assert.equal(typo.data.suggestion, 'user@gmail.com');
  const check = await api('POST', '/check-email', { email: 'someone@yaho.com' });
  assert.equal(check.data.suggestion, 'someone@yahoo.com');
  const nomx = await register({ email: 'a@nomx-domain.test' });
  assert.equal(nomx.data.code, 'EMAIL_DOMAIN_INVALID');
});

test('second account on the same device gets 0 welcome coins, even after verification', async () => {
  const device = newDevice();
  const firstAcc = await register({}, { device });
  assert.equal((await walletOf(firstAcc.data.token)).balance.total, 3);
  const second = await register({}, { device });
  assert.equal(second.status, 200, 'can still sign up');
  assert.equal((await walletOf(second.data.token)).balance.total, 0);
  await verify(second.data.user.uid);
  const w = await walletOf(second.data.token);
  assert.equal((await common.CoinLedger.countDocuments({ uid: second.data.user.uid, type: 'welcome_bonus' })), 0);
  assert.equal(w.pendingWelcome, 0);
  const user = await common.User.findById(second.data.user.uid).lean();
  assert.equal(user.welcomeBlockedReason, 'device');
  assert.ok(await common.AbuseEvent.exists({ type: 'welcome_blocked_device', uid: second.data.user.uid }));
});

test('at most 3 sign-ups per network per 24h get welcome coins', async () => {
  const ip = '198.51.100.77';
  const totals: number[] = [];
  for (let i = 0; i < 4; i++) {
    const res = await register({}, { ip });
    totals.push((await walletOf(res.data.token)).balance.total);
  }
  assert.deepEqual(totals, [3, 3, 3, 0]);
});

// ---- 4b: verified-only rewards ----

test('unverified: no bonus coins (kept for later), no coin packs; verified gets them', async () => {
  const res = await register();
  const { token } = res.data;
  const uid = res.data.user.uid;
  const card = await api('PATCH', '/me/business', { state: 'Gujarat', city: 'Surat', catalogSizeBand: '11-50', sellsOn: ['Amazon', 'Meesho'] }, { token });
  assert.equal(card.data.bonusGranted, false);
  assert.equal(card.data.bonusPending, true);
  assert.equal((await walletOf(token)).balance.total, 3, 'no bonus before verification');
  const order = await api('POST', '/wallet/packs/pack_30/order', {}, { token });
  assert.equal(order.status, 403);
  assert.equal(order.data.error, 'Verify your email first.');

  await verify(uid);
  const reasons = (await ledger(uid)).map((r: any) => r[0]);
  assert.ok(reasons.includes('Business details added'), 'pending bonus granted on verification');
  assert.equal((await walletOf(token)).balance.total, 3 + 7 + 2 + 2);
});

test('referrals: nothing while the referred seller is unverified; unverified referrer gets nothing', async () => {
  // Verified referrer.
  const referrer = await register();
  await verify(referrer.data.user.uid);
  const refCode = (await walletOf(referrer.data.token)).referral.code;
  const referred = await register({ attribution: { ref: refCode } });
  const rUid = referred.data.user.uid;
  await common.User.updateOne({ _id: rUid }, { $set: { firstListingAt: new Date(), usageCount: 1 } });
  const { processReferralAfterListing } = await import('../utils/wallet.js');
  await processReferralAfterListing(rUid);
  assert.equal(await common.CoinLedger.countDocuments({ type: 'referral', uid: { $in: [rUid, referrer.data.user.uid] } }), 0, 'no reward while unverified');
  await verify(rUid);
  assert.equal(await common.CoinLedger.countDocuments({ type: 'referral', uid: rUid }), 1, 'referred rewarded after verifying');
  assert.equal(await common.CoinLedger.countDocuments({ type: 'referral', uid: referrer.data.user.uid }), 1);

  // Unverified referrer.
  const lazy = await register();
  await common.User.updateOne({ _id: lazy.data.user.uid }, { $set: { referralCode: 'LAZYREF1' } });
  const friend = await register({ attribution: { ref: 'LAZYREF1' } });
  await common.User.updateOne({ _id: friend.data.user.uid }, { $set: { firstListingAt: new Date(), usageCount: 1 } });
  await verify(friend.data.user.uid);
  assert.equal(await common.CoinLedger.countDocuments({ type: 'referral', uid: lazy.data.user.uid }), 0);
  assert.equal((await common.User.findById(friend.data.user.uid).lean()).referral.reason, 'referrer_unverified');
});

// ---- 3: onboarding card ----

test('business card: +2 once when state + product count + channels are filled; dismiss hides it', async () => {
  const res = await register();
  const { token } = res.data;
  await verify(res.data.user.uid);
  let me = (await api('GET', '/me', undefined, { token })).data.user;
  assert.equal(me.businessCard.show, true);
  const partial = await api('PATCH', '/me/business', { state: 'Gujarat' }, { token });
  assert.equal(partial.data.complete, false);
  const before = (await walletOf(token)).balance.total;
  const full = await api('PATCH', '/me/business', { city: 'Surat', catalogSizeBand: '1-10', sellsOn: ['Meesho'], gstNumber: '' }, { token });
  assert.equal(full.data.bonusGranted, true);
  await api('PATCH', '/me/business', { sellsOn: ['Meesho', 'Amazon'] }, { token });
  assert.equal((await walletOf(token)).balance.total, before + 2, '+2 exactly once');
  me = (await api('GET', '/me', undefined, { token })).data.user;
  assert.equal(me.businessCard.show, false);
  assert.equal(me.state, 'Gujarat');
  assert.equal(await common.FunnelEvent.countDocuments({ name: 'onboarding_details_added', uid: res.data.user.uid }), 1);
  assert.equal((await api('PATCH', '/me/business', { state: 'Nowhere' }, { token })).status, 400);

  const other = await register();
  await api('PATCH', '/me/business', { dismiss: true }, { token: other.data.token });
  assert.equal((await api('GET', '/me', undefined, { token: other.data.token })).data.user.businessCard.show, false);
});

// ---- 2: Google ----

test('Google: new account asks only mobile + terms, then gets all 10 coins; existing unverified account gets verified', async () => {
  const profiles: Record<string, any> = {
    'cred-new': { sub: 'g-new-1', email: 'newgoogle@gmail.com', emailVerified: true, name: 'Google Seller' },
    'cred-old': { sub: 'g-old-1', email: '', emailVerified: true, name: 'Old' },
  };
  auth.setGoogleVerifierForTests(async (c: string) => profiles[c] ?? null);
  assert.equal((await api('POST', '/auth/google', { credential: 'garbage' })).status, 401);

  const step1 = await api('POST', '/auth/google', { credential: 'cred-new' });
  assert.equal(step1.data.needsProfile, true);
  assert.equal(step1.data.email, 'newgoogle@gmail.com');
  assert.equal((await api('POST', '/auth/google/complete', { pendingToken: step1.data.pendingToken, phoneNumber: '123', termsAccepted: true })).data.code, 'INVALID_PHONE');
  const done = await api('POST', '/auth/google/complete', { pendingToken: step1.data.pendingToken, phoneNumber: nextPhone(), termsAccepted: true, whatsappOptIn: true }, { device: newDevice() });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.user.emailVerified, true);
  const w = await walletOf(done.data.token);
  const welcome = (await common.CoinLedger.find({ uid: done.data.user.uid, type: 'welcome_bonus' }).lean()).reduce((s: number, r: any) => s + r.amount, 0);
  assert.equal(welcome, 10);
  assert.equal(w.balance.total, 12, '10 welcome + 2 mobile');
  // Signing in with Google again logs straight in.
  const again = await api('POST', '/auth/google', { credential: 'cred-new' });
  assert.ok(again.data.token);
  assert.equal(again.data.needsProfile, undefined);

  // An email account that never verified: Google sign-in verifies it → +7.
  const email = newEmail();
  const existing = await register({ email });
  profiles['cred-old'].email = email;
  const linked = await api('POST', '/auth/google', { credential: 'cred-old' });
  assert.ok(linked.data.token);
  assert.equal((await walletOf(linked.data.token)).balance.total, 12);
  assert.equal((await common.User.findById(existing.data.user.uid).lean()).googleSub, 'g-old-1');
  auth.setGoogleVerifierForTests(null);
});

// ---- 5: guest listing ----

test('guest try: preview only; second try on the same device is blocked; claim saves it free', async () => {
  const device = newDevice();
  const req = { prompt: 'Describe this product', schema: { type: 'object', properties: { general: {}, amazon: {}, flipkart: {}, meesho: {}, instagram: {} } }, image: { data: 'aGVsbG8=', mimeType: 'image/jpeg' } };
  const res = await api('POST', '/ai/guest-listing', req, { device });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.preview.amazonTitle, 'Women Pink Cotton Straight Kurti');
  assert.deepEqual(res.data.preview.bullets, ['SOFT COTTON: breathable', 'EASY CARE: machine wash']);
  assert.equal(res.data.preview.hsnCode, '6104');
  assert.match(res.data.preview.gst.text, /5% up to ₹2,500 per piece, 18% above/);
  assert.equal(JSON.stringify(res.data).includes('FIT: straight'), false, 'the rest stays on the server');
  assert.equal(await common.AiUsage.countDocuments({ purpose: 'guest_listing', uid: 'guest' }), 1);

  assert.equal((await api('GET', '/ai/guest-status', undefined, { device })).data.available, false, 'device already used its try');
  assert.equal((await api('GET', '/ai/guest-status', undefined, { device: newDevice() })).data.available, true);
  const again = await api('POST', '/ai/guest-listing', req, { device });
  assert.equal(again.status, 429);
  assert.equal(again.data.error, 'Sign up free to create listings.');

  // A returning visitor gets the same preview back while the token is valid.
  const again2 = await api('POST', '/ai/guest-listing/preview', { token: res.data.token });
  assert.equal(again2.status, 200);
  assert.deepEqual(again2.data.preview, res.data.preview);
  assert.equal((await api('POST', '/ai/guest-listing/preview', { token: 'x'.repeat(32) })).status, 404);

  const acc = await register({}, { device: newDevice() });
  const coinsBefore = (await walletOf(acc.data.token)).balance.total;
  const claim = await api('POST', '/ai/guest-listing/claim', { token: res.data.token }, { token: acc.data.token });
  assert.equal(claim.status, 200, JSON.stringify(claim.data));
  const draft = await common.ListingDraft.findById(claim.data.draftId).lean();
  assert.equal(draft.uid, acc.data.user.uid);
  assert.equal(draft.results.amazon.bulletPoint3.values[0], 'FIT: straight');
  assert.equal((await walletOf(acc.data.token)).balance.total, coinsBefore, 'no coin spent');
  const list = await api('GET', '/drafts', undefined, { token: acc.data.token });
  assert.ok(list.data.some((d: any) => d.id === claim.data.draftId), 'appears in My Listings');
  assert.equal((await api('POST', '/ai/guest-listing/claim', { token: res.data.token }, { token: acc.data.token })).data.draftId, claim.data.draftId, 'idempotent');
  const other = await register({}, { device: newDevice() });
  assert.equal((await api('POST', '/ai/guest-listing/claim', { token: res.data.token }, { token: other.data.token })).status, 409);
  assert.equal((await api('POST', '/ai/guest-listing/preview', { token: res.data.token })).status, 404, 'no preview once saved to an account');
});

test('guest try: 3 per network per day', async () => {
  const ip = '192.0.2.200';
  const req = { prompt: 'x', schema: { type: 'object', properties: { general: {}, amazon: {} } }, image: { data: 'aGVsbG8=', mimeType: 'image/png' } };
  const statuses: number[] = [];
  for (let i = 0; i < 4; i++) statuses.push((await api('POST', '/ai/guest-listing', req, { device: newDevice(), ip })).status);
  assert.deepEqual(statuses, [200, 200, 200, 429]);
});

// ---- 7: funnel ----

test('funnel events are stored and counted per campaign on the admin page', async () => {
  const device = newDevice();
  for (const name of ['landing_view', 'signup_view', 'sign_up_start', 'signup_submit']) {
    assert.equal((await api('POST', '/events', { name, utm_source: 'facebook', utm_campaign: 'surat_hindi' }, { device })).status, 204);
  }
  assert.equal((await api('POST', '/events', { name: 'hack', utm_campaign: 'x' }, { device })).status, 400);
  const res = await register({ attribution: { utm_source: 'facebook', utm_campaign: 'surat_hindi' } }, { device });
  geminiReply = () => JSON.stringify({ general: {} });
  await api('POST', '/ai/listing', { prompt: 'x', schema: { type: 'object' } }, { token: res.data.token });
  const admin = await new common.User({ email: 'admin@realmail.test', passwordHash: 'x', emailVerified: true, role: 'ADMIN' }).save();
  const adminToken = jwt.sign({ uid: admin._id.toString(), email: admin.email }, 'test-secret');
  const stats = await api('GET', '/admin/stats?campaign=surat_hindi', undefined, { token: adminToken });
  assert.equal(stats.status, 200, JSON.stringify(stats.data).slice(0, 300));
  const row = stats.data.funnel.campaigns.find((c: any) => c.campaign === 'surat_hindi');
  assert.deepEqual(row.steps.map((s: any) => s.count), [1, 1, 1, 1, 1]);
  assert.equal(row.steps[1].pctOfPrevious, 100);
  assert.ok(stats.data.abuse.events.disposable_email >= 1);
});

// ---- 4b: reminder email ----

test('one verification reminder 24h after sign-up; admin lists unverified accounts older than 30 days', async () => {
  const res = await register();
  const uid = res.data.user.uid;
  await common.User.collection.updateOne({ _id: new (await import('mongoose')).default.Types.ObjectId(uid) }, { $set: { createdAt: new Date(Date.now() - 25 * 3600e3) } });
  mails.length = 0;
  assert.ok(await auth.sendVerificationReminders() >= 1);
  assert.ok(mails.some((m) => m.subject === 'Reminder: verify your SellAssist email' && /7 more free AI listings/.test(m.html)));
  mails.length = 0;
  await auth.sendVerificationReminders();
  assert.equal(mails.filter((m) => m.to === res.data.user.email).length, 0, 'only once');

  const old = await register();
  await common.User.collection.updateOne({ _id: new (await import('mongoose')).default.Types.ObjectId(old.data.user.uid) }, { $set: { createdAt: new Date(Date.now() - 40 * 24 * 3600e3) } });
  const admin = await common.User.findOne({ role: 'ADMIN' }).lean();
  const stats = await api('GET', `/admin/stats?from=2020-01-01`, undefined, { token: jwt.sign({ uid: admin._id.toString(), email: admin.email }, 'test-secret') });
  assert.ok(stats.data.abuse.unverified.some((u: any) => u.userId === old.data.user.uid));
  assert.equal(JSON.stringify(stats.data.abuse).includes('@'), false, 'no email addresses on the admin list');
});

test('existing (pre-change) accounts keep the single 10-coin welcome on verification', async () => {
  const user = await new common.User({ email: newEmail(), passwordHash: 'x', emailVerified: false }).save();
  const token = jwt.sign({ uid: user._id.toString(), email: user.email }, 'test-secret');
  assert.equal((await walletOf(token)).balance.total, 0);
  await verify(user._id.toString());
  assert.deepEqual(await ledger(user._id.toString()), [['Welcome bonus', 10]]);
});

// ---- "Where do you sell?" (marketplaces) ----

test('marketplaces: unknown values ignored, "none" exclusive, "other" text capped at 30; persists across logins', async () => {
  const res = await register();
  const { token } = res.data;
  let me = (await api('GET', '/me', undefined, { token })).data.user;
  assert.equal(me.marketplaces, null, 'not answered yet');
  assert.equal(me.marketplacesCard.show, true);

  const saved = await api('PUT', '/me/marketplaces', { marketplaces: ['Meesho', 'amazon', 'ebay', 42, 'amazon', 'other'], other: '  GlowRoad <b>and</b> a very long shop name here ' }, { token });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.marketplaces, ['amazon', 'meesho', 'other']);
  assert.equal(saved.data.marketplacesOther.length <= 30, true);
  assert.doesNotMatch(saved.data.marketplacesOther, /[<>]/);

  // "none" + a channel → the channel wins; "none" alone stays; other text dropped without "other".
  assert.deepEqual((await api('PUT', '/me/marketplaces', { marketplaces: ['none', 'flipkart'], other: 'x' }, { token })).data, { ok: true, marketplaces: ['flipkart'], marketplacesOther: null });
  assert.deepEqual((await api('PUT', '/me/marketplaces', { marketplaces: ['none'] }, { token })).data.marketplaces, ['none']);
  assert.equal((await api('PUT', '/me/marketplaces', { marketplaces: 'amazon' }, { token })).status, 400);
  await api('PUT', '/me/marketplaces', { marketplaces: ['social', 'website', 'offline'] }, { token });

  // New session (login) sees the same answer and no card.
  const login = await api('POST', '/login', { email: res.data.user.email, password: 'Str0ng!Pass' });
  me = (await api('GET', '/me', undefined, { token: login.data.token })).data.user;
  assert.deepEqual(me.marketplaces, ['social', 'website', 'offline']);
  assert.equal(me.marketplacesCard.show, false);
  const doc = await common.User.findById(res.data.user.uid).lean();
  assert.ok(doc.marketplaces_updated_at instanceof Date);
});

test('marketplaces card: dismiss hides it for good; business card saves marketplaces and counts them for the +2', async () => {
  const a = await register();
  await api('PUT', '/me/marketplaces', { dismiss: true }, { token: a.data.token });
  let me = (await api('GET', '/me', undefined, { token: a.data.token })).data.user;
  assert.equal(me.marketplacesCard.show, false);
  assert.equal(me.marketplaces, null);

  const b = await register();
  await verify(b.data.user.uid);
  const full = await api('PATCH', '/me/business', { state: 'Telangana', catalogSizeBand: '11-50', marketplaces: ['meesho', 'nope'], marketplacesOther: 'ignored' }, { token: b.data.token });
  assert.equal(full.data.complete, true);
  assert.equal(full.data.bonusGranted, true);
  me = (await api('GET', '/me', undefined, { token: b.data.token })).data.user;
  assert.deepEqual(me.marketplaces, ['meesho']);
  assert.equal(me.marketplacesOther, null);
  assert.equal(me.marketplacesCard.show, false);
  // Saving the card without touching the question keeps the earlier answer.
  await api('PATCH', '/me/business', { city: 'Hyderabad', marketplaces: [] }, { token: b.data.token });
  assert.deepEqual((await api('GET', '/me', undefined, { token: b.data.token })).data.user.marketplaces, ['meesho']);

  // Dismissing the business card (which holds the question) also retires the marketplaces card.
  const c = await register();
  await api('PATCH', '/me/business', { dismiss: true }, { token: c.data.token });
  assert.equal((await api('GET', '/me', undefined, { token: c.data.token })).data.user.marketplacesCard.show, false);
});

test('admin marketplaces table: counts and shares match the database, filtered by utm_campaign; CSV export', async () => {
  const answers: Array<[string, string[]]> = [
    ['mp_surat', ['meesho', 'amazon']], ['mp_surat', ['meesho']], ['mp_surat', ['none']], ['mp_surat', []],
    ['mp_hyd', ['flipkart']],
  ];
  for (const [campaign, list] of answers) {
    const r = await register({ attribution: { utm_source: 'facebook', utm_campaign: campaign } });
    if (list.length) await api('PUT', '/me/marketplaces', { marketplaces: list }, { token: r.data.token });
  }
  const admin = await new common.User({ email: 'mp-admin@realmail.test', passwordHash: 'x', emailVerified: true, role: 'ADMIN' }).save();
  const adminToken = jwt.sign({ uid: admin._id.toString(), email: admin.email }, 'test-secret');
  assert.equal((await api('GET', '/admin/stats?campaign=mp_surat', undefined, { token: (await register()).data.token })).status, 403);

  const stats = (await api('GET', '/admin/stats?campaign=mp_surat', undefined, { token: adminToken })).data.marketplaces;
  const users = await common.User.find({ 'attribution.utm_campaign': 'mp_surat' }).lean();
  const answered = users.filter((u: any) => u.marketplaces_updated_at);
  assert.equal(stats.signups, users.length);
  assert.equal(stats.respondents, answered.length);
  for (const row of stats.rows) {
    const inDb = answered.filter((u: any) => (u.marketplaces ?? []).includes(row.value)).length;
    assert.equal(row.sellers, inDb, row.value);
  }
  const meesho = stats.rows.find((r: any) => r.value === 'meesho');
  assert.deepEqual([meesho.sellers, meesho.pctOfRespondents, meesho.pctOfSignups], [2, 66.7, 50]);
  assert.equal(stats.rows.find((r: any) => r.value === 'flipkart').sellers, 0, 'Hyderabad campaign filtered out');

  const csv = await api('GET', '/admin/stats.csv?type=marketplaces&campaign=mp_hyd', undefined, { token: adminToken });
  assert.equal(csv.status, 200);
  assert.match(csv.data, /^marketplace,sellers,pct_of_respondents,pct_of_signups\n/);
  assert.match(csv.data, /"flipkart","1","100","100"/);
  const perSeller = await api('GET', '/admin/stats.csv?type=users&campaign=mp_surat', undefined, { token: adminToken });
  assert.match(perSeller.data, /"amazon\|meesho"/);
});
