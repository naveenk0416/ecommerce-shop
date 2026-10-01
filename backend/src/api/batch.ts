import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from './auth.js';
import { BatchItem, BatchJob, ensureConnected, Listing, ListingDraft, ProductImage, User } from './common.js';
import { coinConfig } from '../config/coins.js';
import { publicApiUrl } from '../utils/public-url.js';
import { coinBalance, ensureWallet, grantBonus } from '../utils/wallet.js';
import { gstFieldsFor, normalizeListingNumbers, parseAmount } from '../utils/listing-fields.js';
import { applyVariants, hasRealVariants, sanitizeVariants, totalStock, variantLabel, type Variant } from '../utils/variants.js';
import { setCoinBalanceHeader } from '../utils/coin-header.js';
import { sanitizeCommon, type BatchCommon } from '../batch/listing-result.js';
import { cancelBatch, kickBatchWorker, refreshBatchCounts } from '../batch/worker.js';

/**
 * "Add many products": up to 20 photos → up to 20 listings. The app uploads the photos, then
 * starts the batch; the queue (batch/worker.ts) generates each product on the server. A coin is
 * taken per product only when it succeeds.
 */
const router = express.Router();

export const MAX_BATCH_PHOTOS = 20;
export const MAX_BATCH_ITEMS = 20;
const MAX_PHOTO_CHARS = 3 * 1024 * 1024; // a ≤1600px JPEG is well under this
const MAX_PROMPT_CHARS = 40000;
const TABS = ['general', 'amazon', 'flipkart', 'meesho', 'instagram'];

function uidOf(req: express.Request): string {
  return (req as any).authUser._id.toString();
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const imageUrl = (id: string) => `${publicApiUrl()}/api/images/${id}.jpg`;

async function loadJob(req: express.Request, res: express.Response): Promise<any | null> {
  const id = String(req.params['id']);
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ error: 'Batch not found.' });
    return null;
  }
  await ensureConnected();
  const job = await BatchJob.findOne({ _id: id, uid: uidOf(req) }).lean();
  if (!job) {
    res.status(404).json({ error: 'Batch not found.' });
    return null;
  }
  return job;
}

/** The batch with every product's status, for the progress and review screens. */
async function batchView(job: any) {
  const batchId = String(job._id);
  const items = await BatchItem.find({ batchId }).sort({ index: 1 }).lean() as any[];
  const draftIds = items.map((i) => i.listing_id).filter((id) => id && mongoose.isValidObjectId(id));
  const drafts = await ListingDraft.find({ _id: { $in: draftIds } }).select('title results.general variants inventoryListingId updatedAt').lean() as any[];
  const draftById = new Map(drafts.map((d) => [String(d._id), d]));
  return {
    id: batchId,
    status: job.status,
    pauseReason: job.pauseReason ?? null,
    pausedUntil: job.pausedUntil ?? null,
    total: job.total,
    done: job.done,
    failed: job.failed,
    common: job.common ?? {},
    createdAt: job.createdAt,
    finishedAt: job.finishedAt ?? null,
    seen: !!job.seenAt,
    items: items.map((item) => {
      const draft = item.listing_id ? draftById.get(String(item.listing_id)) : null;
      const general = draft?.results?.general ?? {};
      const first = (key: string) => String(general?.[key]?.values?.[0] ?? '');
      const variants: Variant[] | null = hasRealVariants(draft?.variants) ? draft.variants : null;
      return {
        id: String(item._id),
        index: item.index,
        status: item.status,
        error: item.error ?? null,
        attempts: item.attempts ?? 0,
        coinCharged: !!item.coin_charged,
        photoCount: item.photoCount,
        photoUrls: (item.photoIds as string[]).map(imageUrl),
        approved: !!item.approvedAt,
        inventoryListingId: item.inventoryListingId ?? draft?.inventoryListingId ?? null,
        listing: draft ? {
          id: String(draft._id),
          title: draft.title || first('productTitle'),
          category: first('category'),
          price: parseAmount(first('sellingPrice')),
          mrp: parseAmount(first('mrp')),
          stock: variants ? totalStock(variants) : parseAmount(first('stock')),
          variants,
        } : null,
      };
    }),
  };
}

// ---- Defaults for the "common details" step (pre-filled from the last batch) ----

router.get('/defaults', authMiddleware, async (req, res) => {
  await ensureConnected();
  const uid = uidOf(req);
  await ensureWallet(uid);
  const last = await BatchJob.findOne({ uid, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).select('common').lean() as any;
  const user = await User.findById(uid).select('sellerProfile').lean() as any;
  const common: BatchCommon = { ...(last?.common ?? {}) };
  if (!common.gstHandling && user?.sellerProfile?.gstHandling) common.gstHandling = user.sellerProfile.gstHandling;
  if (!common.brand && user?.sellerProfile?.brand) common.brand = user.sellerProfile.brand;
  res.json({
    common,
    balance: await coinBalance(uid),
    listingCost: coinConfig.listingCost,
    maxPhotos: MAX_BATCH_PHOTOS,
    maxItems: MAX_BATCH_ITEMS,
  });
});

// ---- The seller's current batch (running, or finished but not opened yet) ----

router.get('/active', authMiddleware, async (req, res) => {
  await ensureConnected();
  const uid = uidOf(req);
  const job = await BatchJob.findOne({ uid, active: true }).lean()
    ?? await BatchJob.findOne({ uid, status: 'done', seenAt: { $exists: false } }).sort({ finishedAt: -1 }).lean();
  res.json({ batch: job ? await batchView(job) : null });
});

router.get('/:id', authMiddleware, async (req, res) => {
  const job = await loadJob(req, res);
  if (job) res.json({ batch: await batchView(job) });
});

// ---- Create: common details + how many photos each product has ----

router.post('/', authMiddleware, async (req, res) => {
  await ensureConnected();
  const uid = uidOf(req);
  const { prompt, schema, items, common: rawCommon } = req.body || {};
  const schemaProps = isObject(schema) && isObject(schema['properties']) ? Object.keys(schema['properties'] as object) : [];
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS
    || !schemaProps.includes('general') || schemaProps.some((k) => !TABS.includes(k))) {
    res.status(400).json({ error: 'Invalid request. Please refresh the page and try again.' });
    return;
  }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Add at least one product.' });
    return;
  }
  if (items.length > MAX_BATCH_ITEMS) {
    res.status(400).json({ error: `Up to ${MAX_BATCH_ITEMS} products per batch.` });
    return;
  }
  const counts = items.map((i: any) => Number(i?.photoCount));
  if (counts.some((n: number) => !Number.isInteger(n) || n < 1)) {
    res.status(400).json({ error: 'Every product needs at least one photo.' });
    return;
  }
  if (counts.reduce((a: number, b: number) => a + b, 0) > MAX_BATCH_PHOTOS) {
    res.status(400).json({ error: `Up to ${MAX_BATCH_PHOTOS} photos per batch.` });
    return;
  }
  const { common, error } = sanitizeCommon(rawCommon);
  if (error) {
    res.status(400).json({ error, field: 'common' });
    return;
  }
  await ensureWallet(uid);
  const balance = await coinBalance(uid);
  const needed = items.length * coinConfig.listingCost;
  if (balance < needed) {
    res.status(402).json({ error: `${items.length} products need ${needed} coins — you have ${balance}.`, code: 'NOT_ENOUGH_COINS', needed, balance });
    return;
  }

  let job;
  try {
    job = await BatchJob.create({ uid, status: 'uploading', total: items.length, common, prompt, schema });
  } catch (err: any) {
    if (err?.code === 11000) {
      const existing = await BatchJob.findOne({ uid, active: true }).select('_id status').lean() as any;
      res.status(409).json({ error: 'You already have a batch running. Wait for it to finish, then start the next one.', code: 'ACTIVE_BATCH', batchId: existing ? String(existing._id) : null });
      return;
    }
    throw err;
  }
  const batchId = String(job._id);
  const created = await BatchItem.insertMany(counts.map((photoCount: number, index: number) => ({ batchId, uid, index, photoCount, status: 'uploading' })));
  // Remember GST handling for the bulk files, like the seller profile does.
  if (common?.gstHandling) await User.updateOne({ _id: uid }, { $set: { 'sellerProfile.gstHandling': common.gstHandling } });
  res.status(201).json({ id: batchId, items: created.map((i: any) => ({ id: String(i._id), index: i.index, photoCount: i.photoCount })) });
});

// ---- Upload photo n of a product (repeatable: a re-upload replaces it) ----

router.put('/:id/items/:itemId/photos/:n', authMiddleware, async (req, res) => {
  const job = await loadJob(req, res);
  if (!job) return;
  if (job.status !== 'uploading') {
    res.status(409).json({ error: 'This batch has already started.' });
    return;
  }
  const n = Number(req.params['n']);
  const itemId = String(req.params['itemId']);
  const item = mongoose.isValidObjectId(itemId) ? await BatchItem.findOne({ _id: itemId, batchId: String(job._id) }).lean() as any : null;
  if (!item || !Number.isInteger(n) || n < 0 || n >= item.photoCount) {
    res.status(404).json({ error: 'Photo slot not found.' });
    return;
  }
  const image = req.body?.image;
  if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/i.test(image) || image.length > MAX_PHOTO_CHARS) {
    res.status(400).json({ error: 'Each photo must be a JPEG, PNG or WebP under 2 MB.' });
    return;
  }
  const uid = uidOf(req);
  const photo = await ProductImage.create({ uid, data: image, batchId: String(job._id) });
  // Only this slot changes (photos of one product upload in parallel).
  const before = await BatchItem.findOneAndUpdate({ _id: itemId }, { $set: { [`photoIds.${n}`]: String(photo._id) } }, { new: false }).lean() as any;
  const previous = before?.photoIds?.[n];
  if (previous) await ProductImage.deleteOne({ _id: previous, uid });
  res.json({ ok: true, photoId: String(photo._id) });
});

// ---- Start generating ----

router.post('/:id/start', authMiddleware, async (req, res) => {
  const job = await loadJob(req, res);
  if (!job) return;
  if (job.status !== 'uploading') {
    res.json({ batch: await batchView(job) });
    return;
  }
  const batchId = String(job._id);
  const items = await BatchItem.find({ batchId }).lean() as any[];
  const missing = items.filter((i) => (i.photoIds ?? []).filter(Boolean).length < i.photoCount);
  if (missing.length) {
    res.status(400).json({ error: 'Some photos haven\'t finished uploading. Please wait and try again.', code: 'PHOTOS_MISSING', items: missing.map((i) => String(i._id)) });
    return;
  }
  const uid = uidOf(req);
  const balance = await coinBalance(uid);
  const needed = items.length * coinConfig.listingCost;
  if (balance < needed) {
    res.status(402).json({ error: `${items.length} products need ${needed} coins — you have ${balance}.`, code: 'NOT_ENOUGH_COINS', needed, balance });
    return;
  }
  await BatchItem.updateMany({ batchId, status: 'uploading' }, { $set: { status: 'queued' } });
  await BatchJob.updateOne({ _id: batchId, status: 'uploading' }, { $set: { status: 'queued', startedAt: new Date() } });
  kickBatchWorker();
  res.json({ batch: await batchView(await BatchJob.findById(batchId).lean()) });
});

// ---- Cancel an upload that hasn't started (nothing was charged) ----

router.post('/:id/cancel', authMiddleware, async (req, res) => {
  const job = await loadJob(req, res);
  if (!job) return;
  if (job.status !== 'uploading') {
    res.status(409).json({ error: 'This batch has already started.' });
    return;
  }
  await cancelBatch(String(job._id));
  res.json({ ok: true });
});

// ---- Retry one failed product ----

router.post('/:id/items/:itemId/retry', authMiddleware, async (req, res) => {
  const job = await loadJob(req, res);
  if (!job) return;
  const uid = uidOf(req);
  const batchId = String(job._id);
  const itemId = String(req.params['itemId']);
  const item = mongoose.isValidObjectId(itemId) ? await BatchItem.findOne({ _id: itemId, batchId }).lean() as any : null;
  if (!item || item.status !== 'failed') {
    res.status(409).json({ error: 'Only a failed product can be retried.' });
    return;
  }
  if ((await coinBalance(uid)) < coinConfig.listingCost) {
    res.status(402).json({ error: 'You need 1 coin to retry this product.', code: 'NOT_ENOUGH_COINS' });
    return;
  }
  if (!job.active) {
    try {
      await BatchJob.updateOne({ _id: batchId }, { $set: { active: true, status: 'running', pauseReason: null }, $unset: { finishedAt: 1, seenAt: 1 } });
    } catch (err: any) {
      if (err?.code === 11000) {
        res.status(409).json({ error: 'Another batch is running. Retry this product when it has finished.', code: 'ACTIVE_BATCH' });
        return;
      }
      throw err;
    }
  }
  await BatchItem.updateOne({ _id: itemId, status: 'failed' }, { $set: { status: 'queued', error: null }, $unset: { finishedAt: 1 } });
  await refreshBatchCounts(batchId);
  kickBatchWorker();
  res.json({ batch: await batchView(await BatchJob.findById(batchId).lean()) });
});

// ---- Review ----

router.post('/:id/seen', authMiddleware, async (req, res) => {
  const job = await loadJob(req, res);
  if (!job) return;
  await BatchJob.updateOne({ _id: job._id, seenAt: { $exists: false }, active: false }, { $set: { seenAt: new Date() } });
  res.json({ ok: true });
});

function selectedIds(req: express.Request): string[] | null {
  const ids = req.body?.itemIds;
  if (ids === undefined) return null;
  return Array.isArray(ids) ? ids.filter((i: unknown): i is string => typeof i === 'string' && mongoose.isValidObjectId(i)) : [];
}

/** "Approve all" (no itemIds) or approve the chosen ready products. */
router.post('/:id/approve', authMiddleware, async (req, res) => {
  const job = await loadJob(req, res);
  if (!job) return;
  const ids = selectedIds(req);
  const filter: Record<string, unknown> = { batchId: String(job._id), status: 'ready' };
  if (ids) filter['_id'] = { $in: ids };
  const approve = req.body?.approved !== false;
  await BatchItem.updateMany(filter, approve ? { $set: { approvedAt: new Date() } } : { $unset: { approvedAt: 1 } });
  res.json({ batch: await batchView(await BatchJob.findById(job._id).lean()) });
});

/**
 * "Add to Inventory" for approved products: the same fields as Save to Inventory in the
 * single-photo flow, with sizes and stock per size. Products without a selling price are skipped.
 */
router.post('/:id/inventory', authMiddleware, async (req, res) => {
  const job = await loadJob(req, res);
  if (!job) return;
  const uid = uidOf(req);
  const ids = selectedIds(req);
  const filter: Record<string, unknown> = { batchId: String(job._id), status: 'ready', approvedAt: { $exists: true } };
  if (ids) filter['_id'] = { $in: ids };
  const items = await BatchItem.find(filter).sort({ index: 1 }).lean() as any[];
  const results: Array<{ itemId: string; ok: boolean; inventoryListingId?: string; error?: string }> = [];
  for (const item of items) {
    const draft = await ListingDraft.findOne({ _id: item.listing_id, uid });
    if (!draft) {
      results.push({ itemId: String(item._id), ok: false, error: 'Listing not found.' });
      continue;
    }
    if (draft.inventoryListingId && await Listing.exists({ _id: draft.inventoryListingId, uid })) {
      results.push({ itemId: String(item._id), ok: true, inventoryListingId: draft.inventoryListingId });
      continue;
    }
    const outcome = await draftToInventory(uid, draft);
    if (outcome.error) {
      results.push({ itemId: String(item._id), ok: false, error: outcome.error });
      continue;
    }
    await BatchItem.updateOne({ _id: item._id }, { $set: { inventoryListingId: outcome.id } });
    results.push({ itemId: String(item._id), ok: true, inventoryListingId: outcome.id });
  }
  if (results.some((r) => r.ok)) await grantBonus(uid, 'firstInventorySave').catch((err) => console.error('[wallet] inventory bonus failed', err));
  await setCoinBalanceHeader(res, uid);
  res.json({ results, batch: await batchView(await BatchJob.findById(job._id).lean()) });
});

/** Creates the inventory item for a draft (and links them both ways). */
export async function draftToInventory(uid: string, draft: any): Promise<{ id?: string; error?: string }> {
  const general = draft.results?.general ?? {};
  const first = (key: string) => String(general?.[key]?.values?.[0] ?? '').trim();
  const name = first('productTitle');
  if (!name) return { error: 'Add a product title first.' };
  const body: Record<string, unknown> = {
    sellingPrice: first('sellingPrice'),
    mrp: first('mrp') || first('sellingPrice'),
    costPrice: first('costPrice') || undefined,
    quantity: first('stock') || '0',
    lowStockThreshold: first('lowStockThreshold') || undefined,
  };
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
  const { values, error } = normalizeListingNumbers(body);
  if (error) return { error };
  if (!values['sellingPrice']) return { error: 'Add a selling price first.' };
  let variants: Variant[] | undefined;
  if (hasRealVariants(draft.variants)) {
    const parsed = sanitizeVariants(draft.variants);
    if (parsed.error) return { error: parsed.error };
    variants = parsed.variants;
  }
  const hsnCode = first('hsnCode');
  const listing = new Listing({
    uid,
    name,
    category: first('category'),
    brand: first('brand'),
    sku: first('sku') || undefined,
    description: first('description'),
    hsnCode,
    priceINR: `₹${values['sellingPrice']}`,
    ...values,
    searchTags: first('searchTags').split(',').map((t) => t.trim()).filter(Boolean),
    material: '',
    variations: variants ? [...new Set(variants.map(variantLabel))] : [],
    platformContent: {},
    originalImage: typeof draft.image === 'string' ? draft.image : '',
    processedImage: null,
    draftId: String(draft._id),
    ...gstFieldsFor(hsnCode, values['sellingPrice']),
    createdAt: new Date().toISOString(),
  });
  applyVariants(listing, variants, values['quantity']);
  await listing.save();
  draft.status = 'saved';
  draft.inventoryListingId = listing._id.toString();
  await draft.save();
  return { id: listing._id.toString() };
}

export default router;
