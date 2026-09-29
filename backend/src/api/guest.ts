import express from 'express';
import crypto from 'node:crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authMiddleware } from './auth.js';
import { AbuseEvent, ensureConnected, GuestDraft, GuestUsage, ListingDraft, User } from './common.js';
import { coinConfig, dayKey } from '../config/coins.js';
import { AiCallError, AiTiming, callGemini } from '../utils/gemini.js';
import { calculateGst } from '../utils/gst.js';
import { deviceId, ipHash } from '../utils/request-identity.js';
import { recordUserFunnelEvent } from '../utils/funnel.js';

/**
 * "Try 1 listing free — no sign-up" on the landing page. One AI listing without an account,
 * capped per device, per network per day and globally per day (config: guest.*). Only a preview
 * goes back to the browser; the full listing waits server-side (24h) behind a random token until
 * the visitor signs up and claims it — free, it never costs a coin.
 */
const router = express.Router();

const TABS = ['general', 'amazon', 'flipkart', 'meesho', 'instagram'];
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
// The browser sends the photo already resized to ≤1024px; this is a hard ceiling.
const MAX_IMAGE_BASE64_CHARS = 3 * 1024 * 1024;
const MAX_PROMPT_CHARS = 40000;
const LIMIT_MESSAGE = 'Sign up free to create listings.';

// Extra per-network burst guard in front of the daily caps.
const guestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || ''),
  message: { error: LIMIT_MESSAGE, code: 'GUEST_LIMIT' },
});

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Compact {v, c, r} fields → the { values, confidence, reason } shape saved listings use. */
function expand(compact: unknown): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  if (!isPlainObject(compact)) return out;
  for (const tab of TABS) {
    const fields = compact[tab];
    if (!isPlainObject(fields)) continue;
    out[tab] = {};
    for (const [key, field] of Object.entries(fields)) {
      const f = isPlainObject(field) ? field : {};
      out[tab][key] = {
        values: Array.isArray(f['v']) ? (f['v'] as unknown[]).map((x) => String(x)) : [],
        confidence: typeof f['c'] === 'number' ? f['c'] : 0,
        reason: f['r'] ? String(f['r']) : '',
      };
    }
  }
  return out;
}

function first(results: Record<string, Record<string, any>>, tab: string, key: string): string {
  const value = results[tab]?.[key]?.values?.[0];
  return typeof value === 'string' ? value.trim() : '';
}

/** What the landing page may show before sign-up: title, 2 bullets, HSN + GST explanation. */
function previewOf(results: Record<string, Record<string, any>>) {
  const hsnCode = first(results, 'general', 'hsnCode');
  const gst = calculateGst(hsnCode);
  // Without a price, price-dependent goods read "5% up to ₹2,500 per piece, 18% above".
  const gstText = gst.reason.replace(/^Needs review — /, '').replace(/ Enter the selling price\.$/, '');
  return {
    productTitle: first(results, 'general', 'productTitle'),
    amazonTitle: first(results, 'amazon', 'seoTitle') || first(results, 'general', 'productTitle'),
    bullets: [first(results, 'amazon', 'bulletPoint1'), first(results, 'amazon', 'bulletPoint2')].filter(Boolean),
    hsnCode,
    gst: { rate: gst.rate, text: gstText },
  };
}

type CapHit = 'device' | 'ip' | 'global' | null;

async function capHit(device: string | null, ip: string | null, day: string): Promise<CapHit> {
  const counted = { status: { $ne: 'failed' } };
  const { perDevice, perIpPerDay, globalPerDay } = coinConfig.guest;
  if (device && await GuestUsage.countDocuments({ deviceId: device, ...counted }) >= perDevice) return 'device';
  if (ip && await GuestUsage.countDocuments({ ipHash: ip, day, ...counted }) >= perIpPerDay) return 'ip';
  if (await GuestUsage.countDocuments({ day, ...counted }) >= globalPerDay) return 'global';
  return null;
}

router.post('/guest-listing', guestLimiter, async (req, res) => {
  const startedAt = Date.now();
  if (!coinConfig.guest.enabled) {
    res.status(403).json({ error: LIMIT_MESSAGE, code: 'GUEST_LIMIT' });
    return;
  }
  const { prompt, schema, image } = req.body || {};
  const schemaProps = isPlainObject(schema) && isPlainObject(schema['properties']) ? Object.keys(schema['properties'] as object) : [];
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS
    || !schemaProps.includes('general') || !schemaProps.includes('amazon') || schemaProps.some((k) => !TABS.includes(k))) {
    res.status(400).json({ error: 'Invalid request.' });
    return;
  }
  const mimeType = String(image?.mimeType || '').toLowerCase().replace('image/jpg', 'image/jpeg');
  if (!isPlainObject(image) || typeof image['data'] !== 'string' || !image['data'] || (image['data'] as string).length > MAX_IMAGE_BASE64_CHARS || !IMAGE_MIME_TYPES.has(mimeType)) {
    res.status(400).json({ error: 'Please upload a JPG, PNG or WebP photo.', code: 'BAD_IMAGE' });
    return;
  }
  const device = deviceId(req);
  if (!device) {
    res.status(400).json({ error: LIMIT_MESSAGE, code: 'GUEST_LIMIT' });
    return;
  }

  await ensureConnected();
  const ip = ipHash(req);
  const day = dayKey();
  const hit = await capHit(device, ip, day);
  if (hit) {
    AbuseEvent.create({ type: `guest_cap_${hit}`, deviceId: device, ipHash: ip ?? undefined }).catch(() => undefined);
    res.status(429).json({ error: LIMIT_MESSAGE, code: 'GUEST_LIMIT', cap: hit });
    return;
  }
  const usage = await GuestUsage.create({ deviceId: device, ipHash: ip ?? undefined, day });

  const timing: AiTiming = { geminiMs: 0 };
  try {
    const compact = await callGemini('guest', 'guest_listing', {
      model: coinConfig.ai.listingModel,
      prompt,
      schema: schema as Record<string, unknown>,
      image: { data: image['data'] as string, mimeType },
      temperature: 0.4,
      thinkingLevel: coinConfig.ai.listingThinkingLevel,
      maxOutputTokens: coinConfig.ai.listingMaxOutputTokens,
    }, {}, timing);
    const results = expand(compact);
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + coinConfig.guest.draftTtlHours * 3600 * 1000);
    await GuestDraft.create({
      tokenHash: hashToken(token),
      image: `data:${mimeType};base64,${image['data']}`,
      results,
      deviceId: device,
      ipHash: ip ?? undefined,
      expiresAt,
    });
    await GuestUsage.updateOne({ _id: usage._id }, { $set: { status: 'success' } });
    const total = Date.now() - startedAt;
    res.setHeader('Server-Timing', `gemini;dur=${timing.geminiMs},total;dur=${total}`);
    console.log(`[timing] guest_listing total=${total}ms gemini=${timing.geminiMs}ms`);
    res.json({ token, expiresAt: expiresAt.toISOString(), preview: previewOf(results) });
  } catch (err) {
    await GuestUsage.updateOne({ _id: usage._id }, { $set: { status: 'failed' } });
    if (!(err instanceof AiCallError)) console.error('Guest listing error', err);
    res.status(502).json({ error: err instanceof AiCallError ? err.message : 'The AI request failed. Please try again.', code: 'AI_FAILED' });
  }
});

/**
 * Can this browser still use the free try? Same checks as POST /guest-listing (device, network
 * per day, global per day), so the landing page never shows an upload box that would fail.
 */
router.get('/guest-status', async (req, res) => {
  if (!coinConfig.guest.enabled) {
    res.json({ available: false, reason: 'disabled' });
    return;
  }
  await ensureConnected();
  const hit = await capHit(deviceId(req), ipHash(req), dayKey());
  res.json({ available: !hit, reason: hit });
});

/**
 * A returning visitor who already used the free try: their saved preview again (same fields as
 * the first time), while the token is valid and the listing hasn't been saved to an account.
 * POST so the token never appears in request logs.
 */
router.post('/guest-listing/preview', async (req, res) => {
  const token = String(req.body?.token || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    res.status(404).json({ error: 'This preview has expired.', code: 'GUEST_EXPIRED' });
    return;
  }
  await ensureConnected();
  const guest = await GuestDraft.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).select('results claimedByUid expiresAt').lean() as any;
  if (!guest || guest.claimedByUid) {
    res.status(404).json({ error: 'This preview has expired.', code: guest ? 'GUEST_CLAIMED' : 'GUEST_EXPIRED' });
    return;
  }
  res.json({ preview: previewOf(guest.results ?? {}), expiresAt: new Date(guest.expiresAt).toISOString() });
});

/**
 * After sign-up / login: the guest listing becomes a normal saved listing on the account (My
 * Listings) — no coin is charged. Claiming twice returns the same listing.
 */
router.post('/guest-listing/claim', authMiddleware, async (req, res) => {
  const token = String(req.body?.token || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    res.status(400).json({ error: 'This preview has expired.', code: 'GUEST_EXPIRED' });
    return;
  }
  await ensureConnected();
  const authUser = (req as any).authUser;
  const uid = authUser._id.toString();
  const guest = await GuestDraft.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!guest) {
    res.status(404).json({ error: 'This preview has expired.', code: 'GUEST_EXPIRED' });
    return;
  }
  if (guest.claimedByUid) {
    if (guest.claimedByUid === uid && guest.claimedDraftId) {
      res.json({ draftId: guest.claimedDraftId });
      return;
    }
    res.status(409).json({ error: 'This preview was already saved to another account.', code: 'GUEST_CLAIMED' });
    return;
  }
  const claimed = await GuestDraft.findOneAndUpdate({ _id: guest._id, claimedByUid: { $exists: false } }, { $set: { claimedByUid: uid } }, { new: true });
  if (!claimed) {
    res.status(409).json({ error: 'This preview was already saved to another account.', code: 'GUEST_CLAIMED' });
    return;
  }
  const results = (claimed.results ?? {}) as Record<string, Record<string, any>>;
  const draft = await new ListingDraft({
    uid,
    title: first(results, 'general', 'productTitle').slice(0, 200),
    image: claimed.image,
    results,
  }).save();
  const draftId = draft._id.toString();
  await GuestDraft.updateOne({ _id: claimed._id }, { $set: { claimedDraftId: draftId } });
  // Their first AI listing (activation), even though it was made before sign-up.
  const firstTime = await User.findOneAndUpdate({ _id: uid, firstListingAt: { $exists: false } }, { $set: { firstListingAt: new Date() } });
  if (firstTime) await recordUserFunnelEvent('first_listing_created', firstTime);
  res.json({ draftId });
});

export default router;
