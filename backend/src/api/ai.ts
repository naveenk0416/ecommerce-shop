import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from './auth.js';
import { ensureConnected, Listing, ListingDraft, User } from './common.js';
import { coinConfig, isBlockedAutofillField } from '../config/coins.js';
import { AiCallError, AiTiming, callGemini } from '../utils/gemini.js';
import { ownImageUrl } from '../utils/public-url.js';
import { setCoinBalanceHeader } from '../utils/coin-header.js';
import { recordUserFunnelEvent } from '../utils/funnel.js';
import {
  assistsLeft, ensureWallet, processReferralAfterListing, refundSpend, releaseAssist, reserveAssist, spendCoins, walletSummary,
  type AssistKind,
} from '../utils/wallet.js';

const router = express.Router();

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
const MAX_IMAGE_BASE64_CHARS = 11 * 1024 * 1024; // ≈ 8 MB of image bytes
const MAX_PROMPT_CHARS = 40000;

/**
 * Server-Timing header + one log line per AI request, so where the time goes is visible in the
 * browser's network panel and in the server log: gemini = the model call, total = whole request.
 */
function reportTiming(res: express.Response, label: string, startedAt: number, timing: AiTiming): void {
  const total = Date.now() - startedAt;
  res.setHeader('Server-Timing', `gemini;dur=${timing.geminiMs},total;dur=${total}`);
  console.log(`[timing] ${label} total=${total}ms gemini=${timing.geminiMs}ms overhead=${total - timing.geminiMs}ms`);
}

function uidOf(req: express.Request): string {
  return (req as any).authUser._id.toString();
}

function normalizeMime(mime: unknown): string {
  const lower = String(mime || '').toLowerCase();
  if (lower === 'image/jpg') return 'image/jpeg';
  return IMAGE_MIME_TYPES.has(lower) ? lower : 'image/jpeg';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * AI listing generation (the "Generate" on /optimize and the older home upload flow). Costs
 * `listingCost` coins, charged before the call and refunded automatically if the call fails.
 * The client builds the prompt/schema (its field lists live there); the model is chosen here.
 */
router.post('/listing', authMiddleware, async (req, res) => {
  const startedAt = Date.now();
  const timing: AiTiming = { geminiMs: 0 };
  await ensureConnected();
  const uid = uidOf(req);
  const { prompt, schema, image, temperature } = req.body || {};

  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS) {
    res.status(400).json({ error: 'Invalid AI request.' });
    return;
  }
  if (schema !== undefined && !isPlainObject(schema)) {
    res.status(400).json({ error: 'Invalid AI request.' });
    return;
  }
  if (image !== undefined && (!isPlainObject(image) || typeof image['data'] !== 'string' || (image['data'] as string).length > MAX_IMAGE_BASE64_CHARS)) {
    res.status(400).json({ error: 'The photo is too large. Please use a photo under 8 MB.' });
    return;
  }

  await ensureWallet(uid);
  const cost = coinConfig.listingCost;
  const charge = await spendCoins(uid, cost, 'AI listing', {});
  if (!charge.ok) {
    await setCoinBalanceHeader(res, uid);
    res.status(402).json({ error: 'You are out of coins.', code: 'OUT_OF_COINS', wallet: await walletSummary(uid) });
    return;
  }

  try {
    const result = await callGemini(uid, 'listing', {
      model: coinConfig.ai.listingModel,
      prompt,
      schema: schema as Record<string, unknown> | undefined,
      image: image ? { data: String(image['data']), mimeType: normalizeMime(image['mimeType']) } : undefined,
      temperature: typeof temperature === 'number' ? Math.min(Math.max(temperature, 0), 1) : 0.4,
      thinkingLevel: coinConfig.ai.listingThinkingLevel,
      maxOutputTokens: coinConfig.ai.listingMaxOutputTokens,
    }, { coinsCharged: cost }, timing);

    const today = new Date().toISOString().split('T')[0];
    const user = await User.findById(uid).select('dailyStats').lean();
    await User.updateOne({ _id: uid }, user?.dailyStats?.date === today
      ? { $inc: { usageCount: 1, 'dailyStats.count': 1 } }
      : { $inc: { usageCount: 1 }, $set: { dailyStats: { date: today, count: 1 } } });
    // Activation: the seller's first AI listing.
    const firstTime = await User.findOneAndUpdate({ _id: uid, firstListingAt: { $exists: false } }, { $set: { firstListingAt: new Date() } });
    if (firstTime) await recordUserFunnelEvent('first_listing_created', firstTime);

    await processReferralAfterListing(uid).catch((err) => console.error('[referral] reward failed', err));
    // Balance after the charge and any referral reward that this listing just unlocked.
    await setCoinBalanceHeader(res, uid);
    reportTiming(res, 'listing', startedAt, timing);
    const fresh = await User.findById(uid).select('coins').lean();
    res.json({ result, balance: { free: fresh?.coins?.free ?? 0, paid: fresh?.coins?.paid ?? 0 } });
  } catch (err) {
    await refundSpend(uid, charge, 'Refund — the AI listing failed');
    const message = err instanceof AiCallError ? err.message : 'The AI request failed. Please try again.';
    if (!(err instanceof AiCallError)) console.error('AI listing error', err);
    await setCoinBalanceHeader(res, uid);
    reportTiming(res, 'listing (failed)', startedAt, timing);
    res.status(502).json({ error: `${message} Your coin was refunded.`, code: 'AI_FAILED' });
  }
});

function limitResponse(res: express.Response, hit: 'item' | 'day', assists: unknown) {
  res.status(429).json({
    error: hit === 'day'
      ? 'You have used all free AI assists for today. They reset at midnight.'
      : 'You have used all free AI assists for this listing.',
    code: 'ASSIST_LIMIT',
    limit: hit,
    assists,
  });
}

async function ownsDraft(uid: string, id: string): Promise<boolean> {
  return mongoose.isValidObjectId(id) && !!(await ListingDraft.exists({ _id: id, uid }));
}

/** Remaining free assists for a listing (shown on the buttons). */
router.get('/assists', authMiddleware, async (req, res) => {
  await ensureConnected();
  const uid = uidOf(req);
  const kind = (req.query['kind'] === 'marketplace_autofill' ? 'marketplace_autofill' : 'field_fix') as AssistKind;
  const listingKey = String(req.query['listingKey'] || '');
  const marketplace = String(req.query['marketplace'] || 'amazon');
  if (!listingKey) {
    res.status(400).json({ error: 'listingKey is required.' });
    return;
  }
  res.json(await assistsLeft(uid, kind, listingKey, marketplace));
});

/**
 * "✨ Improve" on one listing field. Free, limited per listing and per day; a failed call doesn't
 * count. Fields the AI must never fill (brand, MRP, origin, …) are refused.
 */
router.post('/field-fix', authMiddleware, async (req, res) => {
  const startedAt = Date.now();
  const timing: AiTiming = { geminiMs: 0 };
  await ensureConnected();
  const uid = uidOf(req);
  const { listingKey, tab, fieldKey, label, value, maxLength, context } = req.body || {};

  if (typeof listingKey !== 'string' || !(await ownsDraft(uid, listingKey))) {
    res.status(400).json({ error: 'Save this listing first, then try again.' });
    return;
  }
  if (typeof fieldKey !== 'string' || !fieldKey || typeof label !== 'string') {
    res.status(400).json({ error: 'Invalid field.' });
    return;
  }
  if (isBlockedAutofillField(fieldKey, label)) {
    res.status(400).json({ error: `${label} must be entered by you — the AI doesn't fill it.`, code: 'BLOCKED_FIELD' });
    return;
  }

  const hit = await reserveAssist(uid, 'field_fix', listingKey);
  if (hit) {
    limitResponse(res, hit, await assistsLeft(uid, 'field_fix', listingKey));
    return;
  }

  const limit = Math.min(Math.max(Number(maxLength) || 200, 10), 2000);
  const ctx = isPlainObject(context) ? context : {};
  const channel = ({ amazon: 'Amazon India', flipkart: 'Flipkart', meesho: 'Meesho', instagram: 'Instagram', general: 'Indian marketplace' } as Record<string, string>)[String(tab)] || 'Indian marketplace';
  const prompt = [
    `Improve one field of a ${channel} product listing for an Indian seller.`,
    `Product: ${String(ctx['title'] || 'Unknown').slice(0, 200)}`,
    `Category: ${String(ctx['category'] || 'Unknown').slice(0, 200)}`,
    ctx['description'] ? `Description: ${String(ctx['description']).slice(0, 300)}` : '',
    `Field: ${label.slice(0, 100)}`,
    `Current value: ${String(value ?? '').slice(0, 2000) || '(empty)'}`,
    '',
    `Rewrite it to be clearer, more specific and more searchable, at most ${limit} characters.`,
    'Keep the facts in the current value; do not invent brand names, prices, certifications, sizes or measurements.',
    'Return JSON: {"value": "<improved text>"}.',
  ].filter(Boolean).join('\n');

  try {
    const result = await callGemini(uid, 'field_fix', {
      model: coinConfig.ai.assistModel,
      prompt,
      schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
      temperature: 0.6,
      maxOutputTokens: coinConfig.ai.fieldFixMaxOutputTokens,
      thinkingLevel: coinConfig.ai.assistThinkingLevel,
      hedgeAfterMs: coinConfig.ai.fieldFixHedgeAfterMs,
      maxBackups: coinConfig.ai.fieldFixMaxBackups,
    }, { listingKey, marketplace: String(tab || '') }, timing) as { value?: unknown };
    const improved = String(result?.value ?? '').trim().slice(0, limit);
    if (!improved) throw new AiCallError('The AI returned an empty suggestion. Please try again.');
    const assists = await assistsLeft(uid, 'field_fix', listingKey);
    reportTiming(res, 'field_fix', startedAt, timing);
    res.json({ value: improved, assists });
  } catch (err) {
    await releaseAssist(uid, 'field_fix', listingKey);
    const message = err instanceof AiCallError ? err.message : 'The AI request failed. Please try again.';
    if (!(err instanceof AiCallError)) console.error('Field fix error', err);
    res.status(502).json({ error: message, code: 'AI_FAILED', assists: await assistsLeft(uid, 'field_fix', listingKey) });
  }
});

/** The product photo as base64 for Gemini — stored as a data URL, or a marketplace image URL. */
async function listingImage(listing: any): Promise<{ data: string; mimeType: string } | undefined> {
  let source: string = ownImageUrl(listing.processedImage || listing.originalImage || '');
  // A URL to one of our own draft images: read it from the database instead of over HTTP.
  const draftId = /\/api\/drafts\/([a-f0-9]{24})\/image\.jpg/i.exec(source)?.[1];
  if (draftId) {
    const draft = await ListingDraft.findOne({ _id: draftId, uid: listing.uid }).select('image').lean();
    if (typeof (draft as any)?.image === 'string') source = (draft as any).image;
  }
  const match = /^data:([^;]+);base64,(.+)$/.exec(source);
  if (match) return match[2].length <= MAX_IMAGE_BASE64_CHARS ? { data: match[2], mimeType: normalizeMime(match[1]) } : undefined;
  if (!/^https:\/\//i.test(source)) return undefined;
  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return undefined;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 8 * 1024 * 1024) return undefined;
    return { data: bytes.toString('base64'), mimeType: normalizeMime(response.headers.get('content-type')?.split(';')[0]) };
  } catch {
    return undefined;
  }
}

interface AutofillField {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'select' | 'bullets' | 'number';
  options?: string[];
}

/**
 * "Fill empty fields with AI" in Publish to Amazon/Flipkart. Free, limited per listing per
 * marketplace and per day. Only descriptive fields are filled: anything on the blocked list
 * (manufacturer, origin, MRP, weight, dimensions, GTIN, brand, compliance …) is dropped here on
 * the server whatever the client sends. The client only sends fields the seller left empty.
 */
router.post('/marketplace-autofill', authMiddleware, async (req, res) => {
  const startedAt = Date.now();
  const timing: AiTiming = { geminiMs: 0 };
  await ensureConnected();
  const uid = uidOf(req);
  const { listingId, marketplace, fields } = req.body || {};

  if (marketplace !== 'amazon' && marketplace !== 'flipkart') {
    res.status(400).json({ error: 'Unknown marketplace.' });
    return;
  }
  if (typeof listingId !== 'string' || !mongoose.isValidObjectId(listingId)) {
    res.status(400).json({ error: 'Product not found.' });
    return;
  }
  const listing = await Listing.findOne({ _id: listingId, uid }).lean();
  if (!listing) {
    res.status(404).json({ error: 'Product not found.' });
    return;
  }
  if (!Array.isArray(fields) || fields.length === 0) {
    res.status(400).json({ error: 'There are no empty fields to fill.' });
    return;
  }

  const requested: AutofillField[] = fields.slice(0, 80).filter((f: any) => f && typeof f.key === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(f.key))
    .map((f: any) => ({
      key: f.key,
      label: String(f.label || f.key).slice(0, 120),
      kind: ['text', 'textarea', 'select', 'bullets', 'number'].includes(f.kind) ? f.kind : 'text',
      options: Array.isArray(f.options) ? f.options.slice(0, 400).map((o: unknown) => String(o).slice(0, 120)) : undefined,
    }));
  const blocked = requested.filter((f) => isBlockedAutofillField(f.key, f.label)).map((f) => f.key);
  const allowed = requested.filter((f) => !blocked.includes(f.key));
  if (allowed.length === 0) {
    res.status(400).json({ error: 'The remaining fields must be entered by you — the AI doesn\'t fill them.', code: 'ONLY_BLOCKED', blocked });
    return;
  }

  const hit = await reserveAssist(uid, 'marketplace_autofill', listingId, marketplace);
  if (hit) {
    limitResponse(res, hit, await assistsLeft(uid, 'marketplace_autofill', listingId, marketplace));
    return;
  }

  const properties: Record<string, unknown> = {};
  const lines: string[] = [
    `You are filling in descriptive ${marketplace === 'amazon' ? 'Amazon India' : 'Flipkart'} listing attributes for this product.`,
    `Product name: ${String(listing.name || 'Unknown').slice(0, 300)}`,
    `Description: ${String(listing.description || 'Not provided').slice(0, 1500)}`,
    `Category: ${String(listing.category || 'Not provided').slice(0, 200)}`,
    '',
    'Only describe what is visible in the photo or clearly implied by the product details.',
    'If you are not reasonably sure, return an empty string for that field — never guess.',
    'Never invent brand names, prices, weights, measurements, certifications or legal details.',
    'When a list of allowed options is given, pick exactly one of them verbatim or return an empty string.',
    'For bullet points, return up to 5 short lines separated by a newline.',
    '',
  ];
  for (const field of allowed) {
    properties[field.key] = { type: field.kind === 'number' ? 'number' : 'string' };
    const opts = field.options?.length ? ` — choose one of: ${field.options.join(', ')}` : '';
    lines.push(`- ${field.key}: ${field.label}${opts}`);
  }

  try {
    const image = await listingImage(listing);
    const result = await callGemini(uid, 'marketplace_autofill', {
      model: coinConfig.ai.assistModel,
      prompt: lines.join('\n'),
      image,
      schema: { type: 'object', properties },
      temperature: 0.2,
      maxOutputTokens: coinConfig.ai.autofillMaxOutputTokens,
      thinkingLevel: coinConfig.ai.assistThinkingLevel,
    }, { listingKey: listingId, marketplace }, timing) as Record<string, unknown>;

    const values: Record<string, string | number> = {};
    for (const field of allowed) {
      const raw = result?.[field.key];
      if (raw === undefined || raw === null || raw === '') continue;
      if (field.kind === 'number') {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) values[field.key] = n;
        continue;
      }
      const text = String(raw).trim();
      if (!text) continue;
      if (field.options?.length) {
        const match = field.options.find((o) => o === text) ?? field.options.find((o) => o.toLowerCase() === text.toLowerCase());
        if (match) values[field.key] = match;
        continue;
      }
      values[field.key] = text.slice(0, 2000);
    }
    const assists = await assistsLeft(uid, 'marketplace_autofill', listingId, marketplace);
    reportTiming(res, 'marketplace_autofill', startedAt, timing);
    res.json({ values, blocked, assists });
  } catch (err) {
    await releaseAssist(uid, 'marketplace_autofill', listingId, marketplace);
    const message = err instanceof AiCallError ? err.message : 'The AI request failed. Please try again.';
    if (!(err instanceof AiCallError)) console.error('Marketplace autofill error', err);
    res.status(502).json({ error: message, code: 'AI_FAILED', assists: await assistsLeft(uid, 'marketplace_autofill', listingId, marketplace) });
  }
});

export default router;
