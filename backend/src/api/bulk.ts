import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from './auth.js';
import { AssistCounter, BulkFileLog, BulkTemplate, ensureConnected, Listing, ListingDraft, User } from './common.js';
import { dayKey } from '../config/coins.js';
import { publicApiUrl } from '../utils/public-url.js';
import { detectFormat, MAX_TEMPLATE_BYTES, mimeFor } from '../bulk/format.js';
import { parseTemplate, workingBytes, writeCells, type CellWrite, type ParsedTemplate } from '../bulk/workbook.js';
import { fillRows, type ListingSource, type Marketplace, type SellerProfile } from '../bulk/fill.js';
import { hasRealVariants, styleId } from '../utils/variants.js';

/**
 * "Bulk upload file": the seller uploads the official bulk template for a category (Meesho
 * Supplier Panel / Flipkart Seller Hub), picks listings, and downloads the same file with rows
 * filled. SellAssist never logs in to their panel. Free (no coins); 20 files a day.
 */
const router = express.Router();

export const BULK_FILES_PER_DAY = 20;
const MAX_ROWS = 100;
/** Rows in one file: products × their sizes/colours. */
const MAX_FILE_ROWS = 1000;
const TEMPLATE_TTL_MS = 24 * 3600 * 1000;
/** Written as numbers (templates validate them as numbers). SKU, HSN, pincode, EAN stay text (leading zeros). */
const NUMERIC_FIELDS = new Set(['mrp', 'price', 'stock', 'net_quantity', 'weight', 'dimension', 'gst']);

function uidOf(req: express.Request): string {
  return (req as any).authUser._id.toString();
}

function cleanText(value: unknown, max = 300): string | undefined {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return text || undefined;
}

// ---- Seller profile ----

router.get('/profile', authMiddleware, async (req, res) => {
  res.json({ profile: (req as any).authUser.sellerProfile ?? {} });
});

router.put('/profile', authMiddleware, async (req, res) => {
  const b = req.body || {};
  const pincode = cleanText(b.pickupPincode, 6);
  if (pincode && !/^[1-9]\d{5}$/.test(pincode)) {
    res.status(400).json({ error: 'Enter a valid 6-digit pincode.', field: 'pickupPincode' });
    return;
  }
  const profile: SellerProfile = {
    brand: cleanText(b.brand, 100),
    manufacturerName: cleanText(b.manufacturerName, 150),
    manufacturerAddress: cleanText(b.manufacturerAddress, 400),
    packerName: cleanText(b.packerName, 150),
    packerAddress: cleanText(b.packerAddress, 400),
    countryOfOrigin: cleanText(b.countryOfOrigin, 60),
    gstHandling: b.gstHandling === 'exclusive' ? 'exclusive' : b.gstHandling === 'inclusive' ? 'inclusive' : undefined,
    pickupPincode: pincode,
  };
  await ensureConnected();
  await User.updateOne({ _id: uidOf(req) }, { $set: { sellerProfile: profile } });
  res.json({ profile });
});

// ---- Upload a template ----

/** 20 files a day per seller (same atomic counter pattern as the free AI assists). */
async function reserveDailyFile(uid: string): Promise<boolean> {
  try {
    const doc = await AssistCounter.findOneAndUpdate(
      { uid, scope: `bulk:${dayKey()}`, count: { $lt: BULK_FILES_PER_DAY } },
      { $inc: { count: 1 } },
      { upsert: true, new: true },
    );
    return !!doc;
  } catch (err: any) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

function columnsForClient(parsed: ParsedTemplate) {
  return parsed.columns.map((c) => ({
    col: c.col, letter: c.letter, header: c.header, field: c.field, required: c.required,
    neverInvent: c.neverInvent, allowed: c.allowed, dependentList: c.dependentList,
  }));
}

router.post(
  '/templates',
  authMiddleware,
  express.raw({ type: () => true, limit: MAX_TEMPLATE_BYTES + 1024 }),
  async (req, res) => {
    const uid = uidOf(req);
    const marketplace = req.query['marketplace'] === 'flipkart' ? 'flipkart' : req.query['marketplace'] === 'meesho' ? 'meesho' : null;
    if (!marketplace) {
      res.status(400).json({ error: 'Choose Meesho or Flipkart first.' });
      return;
    }
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: 'Please choose the template file.', code: 'NO_FILE' });
      return;
    }
    if (body.length > MAX_TEMPLATE_BYTES) {
      res.status(413).json({ error: 'The file is larger than 10 MB.', code: 'TOO_LARGE' });
      return;
    }
    // By content, never by file name.
    const format = await detectFormat(body);
    if (!format) {
      res.status(400).json({ error: 'This is not an Excel template. Upload the .xlsx, .xls or .xlsm file downloaded from the marketplace.', code: 'BAD_FILE' });
      return;
    }
    await ensureConnected();
    if (!(await reserveDailyFile(uid))) {
      res.status(429).json({ error: `You can make ${BULK_FILES_PER_DAY} files a day. Please try again tomorrow.`, code: 'DAILY_LIMIT' });
      return;
    }
    let working: Buffer;
    let parsed: ParsedTemplate;
    try {
      working = workingBytes(body, format);
      parsed = await parseTemplate(working, format);
    } catch (err: any) {
      const message = /column headings/.test(String(err?.message)) ? err.message : 'We couldn\'t read this file. Please upload the template exactly as downloaded from the marketplace.';
      console.warn('[bulk] template not readable', marketplace, format, err?.message);
      res.status(400).json({ error: message, code: 'UNREADABLE' });
      return;
    }
    const fileName = cleanText(req.query['name'], 150);
    const doc = await BulkTemplate.create({
      uid, marketplace, fileName, inputFormat: format, data: working, parsed,
      expiresAt: new Date(Date.now() + TEMPLATE_TTL_MS),
    });
    res.json({
      id: doc._id.toString(),
      marketplace,
      fileName: fileName ?? null,
      inputFormat: parsed.inputFormat,
      outputFormat: parsed.outputFormat,
      sheetName: parsed.sheetName,
      category: parsed.category,
      headerRow: parsed.headerRow,
      firstRow: parsed.firstEmptyRow,
      columns: columnsForClient(parsed),
      warnings: parsed.warnings,
      maxRows: MAX_ROWS,
    });
  },
);

async function loadTemplate(req: express.Request, res: express.Response) {
  const id = String(req.params['id']);
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ error: 'This template has expired. Please upload it again.', code: 'EXPIRED' });
    return null;
  }
  await ensureConnected();
  const doc = await BulkTemplate.findOne({ _id: id, uid: uidOf(req), expiresAt: { $gt: new Date() } });
  if (!doc) {
    res.status(404).json({ error: 'This template has expired. Please upload it again.', code: 'EXPIRED' });
    return null;
  }
  return doc;
}

// ---- Fill rows from My Listings ----

router.post('/templates/:id/fill', authMiddleware, async (req, res) => {
  const doc = await loadTemplate(req, res);
  if (!doc) return;
  const uid = uidOf(req);
  const ids: string[] = Array.isArray(req.body?.draftIds) ? req.body.draftIds.filter((i: unknown) => typeof i === 'string' && mongoose.isValidObjectId(i)) : [];
  if (ids.length === 0) {
    res.status(400).json({ error: 'Select at least one listing.' });
    return;
  }
  if (ids.length > MAX_ROWS) {
    res.status(400).json({ error: `Select up to ${MAX_ROWS} listings per file.` });
    return;
  }
  const drafts = await ListingDraft.find({ _id: { $in: ids }, uid }).select('results image inventoryListingId updatedAt variants').lean() as any[];
  const inventory = await Listing.find({ uid, $or: [{ draftId: { $in: ids } }, { _id: { $in: drafts.map((d) => d.inventoryListingId).filter((i) => i && mongoose.isValidObjectId(i)) } }] })
    .select('draftId sku sellingPrice mrp quantity gstRate hsnCode category name variants').lean() as any[];
  const invByDraft = new Map<string, any>();
  for (const item of inventory) if (item.draftId) invByDraft.set(String(item.draftId), item);
  for (const d of drafts) {
    const linked = inventory.find((i) => String(i._id) === String(d.inventoryListingId));
    if (linked && !invByDraft.has(String(d._id))) invByDraft.set(String(d._id), linked);
  }
  const byId = new Map(drafts.map((d) => [String(d._id), d]));
  const sources: ListingSource[] = ids.filter((id) => byId.has(id)).map((id) => {
    const d = byId.get(id);
    const inv = invByDraft.get(id);
    const image = typeof d.image === 'string' && d.image
      ? (/^https:\/\//.test(d.image) ? d.image : `${publicApiUrl()}/api/drafts/${id}/image.jpg?v=${new Date(d.updatedAt).getTime()}`)
      : null;
    // Sizes: the inventory item's (current stock) if it has them, else the listing's own.
    const variants = hasRealVariants(inv?.variants) ? inv.variants : hasRealVariants(d.variants) ? d.variants : null;
    return {
      draftId: id,
      results: d.results ?? {},
      imageUrl: image && /^https:\/\//.test(image) ? image : null,
      inventory: inv ? { sku: inv.sku, sellingPrice: inv.sellingPrice, mrp: inv.mrp, quantity: inv.quantity, gstRate: inv.gstRate, hsnCode: inv.hsnCode, category: inv.category, name: inv.name } : null,
      variants,
      styleId: styleId(id),
      photoUrl: (imageId: string) => `${publicApiUrl()}/api/images/${imageId}.jpg`,
    };
  });
  const user = await User.findById(uid).select('sellerProfile').lean() as any;
  const { rows, report } = await fillRows(uid, doc.parsed as ParsedTemplate, doc.marketplace as Marketplace, sources, user?.sellerProfile ?? {});
  res.json({ rows, report });
});

// ---- Download the filled file ----

router.post('/templates/:id/download', authMiddleware, async (req, res) => {
  const doc = await loadTemplate(req, res);
  if (!doc) return;
  const parsed = doc.parsed as ParsedTemplate;
  const rows: Array<{ cells?: Record<string, unknown> }> = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, MAX_FILE_ROWS) : [];
  if (rows.length === 0) {
    res.status(400).json({ error: 'There are no rows to download.' });
    return;
  }
  const byCol = new Map(parsed.columns.map((c) => [c.col, c]));
  const writes: CellWrite[] = [];
  let filledRequired = 0;
  const required = parsed.columns.filter((c) => c.required);
  rows.forEach((row, i) => {
    const rowNumber = parsed.firstEmptyRow + i;
    for (const [key, raw] of Object.entries(row.cells ?? {})) {
      const col = byCol.get(Number(key));
      if (!col) continue;
      const text = String(raw ?? '').slice(0, 5000).trim();
      if (!text) continue;
      const numeric = col.field && NUMERIC_FIELDS.has(col.field) && /^\d+(\.\d+)?$/.test(text);
      writes.push({ row: rowNumber, col: col.col, value: numeric ? Number(text) : text });
    }
    filledRequired += required.filter((c) => String(row.cells?.[c.col] ?? '').trim()).length;
  });

  let file: Buffer;
  try {
    file = await writeCells(doc.data, parsed.sheetPath, writes);
  } catch (err: any) {
    console.error('[bulk] writing failed', doc.marketplace, err?.message);
    await BulkFileLog.create({ uid: uidOf(req), marketplace: doc.marketplace, category: parsed.category ?? undefined, rows: rows.length, errors: ['WRITE_FAILED'], format: parsed.outputFormat });
    res.status(500).json({ error: 'We couldn\'t create the file. Please try again.' });
    return;
  }
  const filledPercent = required.length ? Math.round((filledRequired / (required.length * rows.length)) * 100) : 100;
  await BulkFileLog.create({
    uid: uidOf(req), marketplace: doc.marketplace, category: parsed.category ?? undefined, rows: rows.length, filledPercent,
    errors: filledPercent < 100 ? ['MANDATORY_EMPTY'] : undefined, format: parsed.outputFormat,
  });
  const base = (doc.fileName ?? `${doc.marketplace}-template`).replace(/\.(xlsx|xlsm|xls)$/i, '').replace(/[^A-Za-z0-9 _.-]/g, '_').slice(0, 80);
  res.setHeader('Content-Type', mimeFor(parsed.outputFormat));
  res.setHeader('Content-Disposition', `attachment; filename="${base}-filled.${parsed.outputFormat}"`);
  res.setHeader('X-Output-Format', parsed.outputFormat);
  res.send(file);
});

export default router;
