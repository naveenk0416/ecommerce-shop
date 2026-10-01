import mongoose from 'mongoose';
import { BatchItem, BatchJob, ListingDraft, ProductImage } from '../api/common.js';
import { coinConfig } from '../config/coins.js';
import { AiCallError, callGemini } from '../utils/gemini.js';
import { coinBalance, spendCoinsOnce } from '../utils/wallet.js';
import { recordListingSuccess } from '../utils/listing-usage.js';
import { assignSkus, totalStock } from '../utils/variants.js';
import { batchPromptAddition, batchSchema, buildDraftResults, buildVariants, expandCompact, type BatchCommon } from './listing-result.js';

/**
 * The "Add many products" queue. State lives in MongoDB (BatchJob / BatchItem), so the seller can
 * close the page and a server restart resumes where it stopped. One Gemini call per product —
 * the same prompt as the single-photo flow plus the batch's common details.
 *
 *  - at most `perUser` products of one seller and `global` products overall generate at once
 *  - 429 / 5xx are retried twice with backoff; if the AI is still busy, out of credits or down,
 *    the batch pauses ("We'll continue shortly") and the product goes back in the queue — it is
 *    never failed for that
 *  - a coin is taken only when a product succeeds, exactly once (ledger key batch-item:<id>)
 */
export const workerSettings = {
  perUser: 3,
  global: 10,
  /** Waits before the 2 automatic retries. */
  retryBackoffMs: [2000, 6000],
  /** First pause when the AI is busy; doubles each time up to maxPauseMs. */
  pauseMs: 60_000,
  maxPauseMs: 10 * 60_000,
  /** Re-check for coins this often while paused for coins. */
  coinsRecheckMs: 30_000,
  /** A product "generating" this long without progress is put back in the queue. */
  staleMs: 5 * 60_000,
  /** Batches still uploading photos after this long are cancelled. */
  uploadTimeoutMs: 2 * 3600_000,
  tickMs: 2000,
};

export function configureBatchWorker(overrides: Partial<typeof workerSettings>): void {
  Object.assign(workerSettings, overrides);
}

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
let again = false;
const inFlight = new Set<Promise<void>>();

/** Starts the queue (server start). Products left "generating" by a previous process are re-queued. */
export async function startBatchWorker(): Promise<void> {
  if (timer) return;
  await BatchItem.updateMany({ status: 'generating' }, { $set: { status: 'queued' }, $unset: { lockedAt: 1 } });
  timer = setInterval(() => void tick(), workerSettings.tickMs);
  timer.unref?.();
  kickBatchWorker();
}

export function stopBatchWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Look for work now (after a batch starts, a retry, or a product finishing). */
export function kickBatchWorker(): void {
  setImmediate(() => void tick());
}

/** Tests: wait until every product being generated right now has finished. */
export async function drainBatchWorker(): Promise<void> {
  while (ticking || inFlight.size) {
    if (inFlight.size) await Promise.allSettled([...inFlight]);
    else await sleep(10);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tick(): Promise<void> {
  // Not started (or stopped): nothing is claimed — a restart re-queues what was left.
  if (!timer) return;
  if (ticking) {
    again = true;
    return;
  }
  ticking = true;
  try {
    do {
      again = false;
      await housekeeping();
      for (;;) {
        if (!timer) break;
        const item = await claimNext();
        if (!item) break;
        if (!timer) {
          // Stopped while claiming: leave it for the next start.
          await requeue(String(item._id));
          break;
        }
        const run = processItem(item).catch((err) => console.error('[batch] item crashed', String(item._id), err))
          .finally(() => {
            inFlight.delete(run);
            kickBatchWorker();
          });
        inFlight.add(run);
      }
    } while (again);
  } catch (err) {
    console.error('[batch] tick failed', err);
  } finally {
    ticking = false;
  }
}

async function housekeeping(): Promise<void> {
  const now = Date.now();
  // Stuck "generating" (e.g. the call hung) → back in the queue.
  await BatchItem.updateMany(
    { status: 'generating', lockedAt: { $lt: new Date(now - workerSettings.staleMs) } },
    { $set: { status: 'queued' }, $unset: { lockedAt: 1 } },
  );
  // Paused batches whose wait is over continue (for coins: only once there are coins again).
  const due = await BatchJob.find({ active: true, status: 'paused', pausedUntil: { $lte: new Date(now) } }).select('uid pauseReason').lean() as any[];
  for (const job of due) {
    if (job.pauseReason === 'coins' && (await coinBalance(job.uid)) < coinConfig.listingCost) {
      await BatchJob.updateOne({ _id: job._id, status: 'paused' }, { $set: { pausedUntil: new Date(now + workerSettings.coinsRecheckMs) } });
      continue;
    }
    await BatchJob.updateOne({ _id: job._id, status: 'paused' }, { $set: { status: 'running', pauseReason: null }, $unset: { pausedUntil: 1 } });
  }
  // Abandoned uploads.
  const stale = await BatchJob.find({ active: true, status: 'uploading', createdAt: { $lt: new Date(now - workerSettings.uploadTimeoutMs) } }).select('_id').lean() as any[];
  for (const job of stale) await cancelBatch(String(job._id));
}

/** Cancels a batch that is still uploading: nothing was generated or charged. */
export async function cancelBatch(batchId: string): Promise<void> {
  await BatchJob.updateOne({ _id: batchId, status: 'uploading' }, { $set: { status: 'cancelled', active: false, finishedAt: new Date() } });
  await ProductImage.deleteMany({ batchId });
  await BatchItem.deleteMany({ batchId });
}

async function claimNext(): Promise<any | null> {
  if ((await BatchItem.countDocuments({ status: 'generating' })) >= workerSettings.global) return null;
  const jobs = await BatchJob.find({ active: true, status: { $in: ['queued', 'running'] } }).sort({ createdAt: 1 }).select('_id status').lean() as any[];
  for (const job of jobs) {
    const batchId = String(job._id);
    if ((await BatchItem.countDocuments({ batchId, status: 'generating' })) >= workerSettings.perUser) continue;
    const item = await BatchItem.findOneAndUpdate(
      { batchId, status: 'queued' },
      { $set: { status: 'generating', lockedAt: new Date() } },
      { sort: { index: 1 }, new: true },
    ).lean();
    if (item) {
      if (job.status === 'queued') await BatchJob.updateOne({ _id: job._id, status: 'queued' }, { $set: { status: 'running' } });
      return item;
    }
  }
  return null;
}

/** Back in the queue (not failed, not charged). */
async function requeue(itemId: string): Promise<void> {
  await BatchItem.updateOne({ _id: itemId, status: 'generating' }, { $set: { status: 'queued' }, $unset: { lockedAt: 1 } });
}

async function pauseBatch(batchId: string, reason: 'ai_busy' | 'coins'): Promise<void> {
  const job = await BatchJob.findById(batchId).select('pauseCount status').lean() as any;
  if (!job || job.status === 'paused') return;
  const wait = reason === 'coins'
    ? workerSettings.coinsRecheckMs
    : Math.min(workerSettings.pauseMs * 2 ** (job.pauseCount ?? 0), workerSettings.maxPauseMs);
  await BatchJob.updateOne(
    { _id: batchId, active: true },
    { $set: { status: 'paused', pauseReason: reason, pausedUntil: new Date(Date.now() + wait) }, ...(reason === 'ai_busy' ? { $inc: { pauseCount: 1 } } : {}) },
  );
  console.log(`[batch] ${batchId} paused (${reason}) for ${Math.round(wait / 1000)}s`);
}

/** Recounts ready / failed products; a batch with nothing left to generate is done. */
export async function refreshBatchCounts(batchId: string): Promise<void> {
  const rows = await BatchItem.aggregate([{ $match: { batchId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const by = Object.fromEntries(rows.map((r: any) => [r._id, r.n])) as Record<string, number>;
  const remaining = (by['queued'] ?? 0) + (by['generating'] ?? 0) + (by['uploading'] ?? 0);
  const set: Record<string, unknown> = { done: by['ready'] ?? 0, failed: by['failed'] ?? 0 };
  const job = await BatchJob.findById(batchId).select('status').lean() as any;
  if (job && remaining === 0 && job.status !== 'uploading' && job.status !== 'cancelled') {
    Object.assign(set, { status: 'done', active: false, finishedAt: new Date(), pauseReason: null });
  }
  await BatchJob.updateOne({ _id: batchId }, { $set: set });
}

function dataUrlParts(dataUrl: string): { data: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

async function processItem(item: any): Promise<void> {
  const itemId = String(item._id);
  const batchId = item.batchId as string;
  const uid = item.uid as string;
  const job = await BatchJob.findById(batchId).lean() as any;
  if (!job || !job.active || job.status === 'cancelled' || job.status === 'paused') {
    await requeue(itemId);
    return;
  }
  const cost = coinConfig.listingCost;
  const common = (job.common ?? {}) as BatchCommon;

  // A previous run already created the listing (e.g. the server stopped before marking it
  // ready): don't generate — or charge — twice.
  let draftId: string | undefined = item.listing_id;
  let colours: string[] | undefined = item.colours;
  const generatedNow = !draftId;

  if (!draftId) {
    if (!item.coin_charged && (await coinBalance(uid)) < cost) {
      // Pause first, then re-queue — so no other tick picks the product up in between.
      await pauseBatch(batchId, 'coins');
      await requeue(itemId);
      return;
    }
    const photos = await ProductImage.find({ _id: { $in: item.photoIds }, uid }).lean() as any[];
    const byId = new Map(photos.map((p) => [String(p._id), p]));
    const ordered = (item.photoIds as string[]).map((id) => byId.get(id)).filter(Boolean);
    const images = ordered.map((p) => dataUrlParts(p.data)).filter((x): x is { data: string; mimeType: string } => !!x);
    if (!images.length) {
      await BatchItem.updateOne({ _id: itemId }, { $set: { status: 'failed', error: 'The photo is missing — please add this product again.', finishedAt: new Date() }, $unset: { lockedAt: 1 } });
      await refreshBatchCounts(batchId);
      return;
    }

    let compact: any = null;
    let lastError: unknown = null;
    const attempts = 1 + workerSettings.retryBackoffMs.length;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(workerSettings.retryBackoffMs[attempt - 1]);
      await BatchItem.updateOne({ _id: itemId }, { $inc: { attempts: 1 }, $set: { lockedAt: new Date() } });
      try {
        compact = await callGemini(uid, 'listing', {
          model: coinConfig.ai.listingModel,
          prompt: `${job.prompt}${batchPromptAddition(common, images.length)}`,
          schema: batchSchema(job.schema ?? {}),
          image: images[0],
          extraImages: images.slice(1, 4),
          temperature: 0.4,
          thinkingLevel: coinConfig.ai.listingThinkingLevel,
          maxOutputTokens: coinConfig.ai.listingMaxOutputTokens,
        }, { listingKey: `batch:${itemId}`, coinsCharged: cost });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        // Only busy / rate-limited / down is worth retrying; a bad reply fails now (Retry button).
        if (!(err instanceof AiCallError && err.transient)) break;
      }
    }

    if (lastError) {
      if (lastError instanceof AiCallError && lastError.transient) {
        await pauseBatch(batchId, 'ai_busy');
        await requeue(itemId);
        return;
      }
      const message = lastError instanceof Error ? lastError.message : 'The AI request failed.';
      await BatchItem.updateOne({ _id: itemId }, { $set: { status: 'failed', error: message.slice(0, 300), finishedAt: new Date() }, $unset: { lockedAt: 1 } });
      await refreshBatchCounts(batchId);
      return;
    }

    const expanded = expandCompact(compact);
    if (!expanded['general']?.['productTitle']?.values?.[0]) {
      await BatchItem.updateOne({ _id: itemId }, { $set: { status: 'failed', error: 'The AI reply was incomplete. Please retry.', finishedAt: new Date() }, $unset: { lockedAt: 1 } });
      await refreshBatchCounts(batchId);
      return;
    }
    colours = Array.isArray(compact?.photoColours) ? compact.photoColours.map((c: unknown) => String(c).slice(0, 30)) : undefined;
    const variants = buildVariants(common, colours, item.photoIds);
    const stock = variants ? totalStock(variants) : common.stock?.[''] ?? 0;
    const results = buildDraftResults(expanded, common, stock);
    const newId = new mongoose.Types.ObjectId();
    const draft = await ListingDraft.create({
      _id: newId,
      uid,
      title: String(results['general']?.['productTitle']?.values?.[0] ?? '').slice(0, 200),
      image: ordered[0].data,
      results,
      ...(variants ? { variants: assignSkus(newId.toString(), variants) } : {}),
      ...(common.sizePreset ? { sizePreset: common.sizePreset } : {}),
      imageIds: item.photoIds,
      batchId,
      batchItemId: itemId,
    });
    draftId = draft._id.toString();
    // Remember the listing before charging, so a crash from here on can't generate it again.
    await BatchItem.updateOne({ _id: itemId }, { $set: { listing_id: draftId, colours } });
  }

  const charge = await spendCoinsOnce(uid, cost, `batch-item:${itemId}`, 'AI listing (Add many products)', { batchId, itemId });
  await BatchItem.updateOne(
    { _id: itemId },
    { $set: { status: 'ready', coin_charged: charge.ok, finishedAt: new Date(), error: null }, $unset: { lockedAt: 1 } },
  );
  await BatchJob.updateOne({ _id: batchId }, { $set: { pauseCount: 0 } });
  if (!charge.ok) {
    // Coins were spent elsewhere while this one ran: keep the listing, stop before the next.
    console.warn(`[batch] ${itemId} ready but not charged — balance too low`);
    await pauseBatch(batchId, 'coins');
  }
  if (generatedNow) await recordListingSuccess(uid).catch((err) => console.error('[batch] usage update failed', err));
  await refreshBatchCounts(batchId);
}
