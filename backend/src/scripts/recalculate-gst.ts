/**
 * Recalculates GST for every saved listing from its HSN code + selling price using the GST 2.0
 * rate table (src/data/gst-rate-table.ts) and writes a CSV report of what would change.
 *
 * Dry run by default — nothing is written to the database:
 *   npx tsx src/scripts/recalculate-gst.ts [--out gst-report.csv]
 * After reviewing the report, apply it:
 *   npx tsx src/scripts/recalculate-gst.ts --apply
 *
 * --apply only updates the GST fields (gstRate, gstNeedsReview, gstReason, gstTableVersion);
 * nothing else on the listing is touched.
 */
import '../utils/env.js';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { ensureConnected, Listing } from '../api/common.js';
import { gstFieldsFor, parseAmount } from '../utils/listing-fields.js';
import { GST_TABLE_VERSION } from '../data/gst-rate-table.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const outIndex = args.indexOf('--out');
const outPath = outIndex >= 0 ? args[outIndex + 1] : 'gst-recalculation-report.csv';

const csv = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function main() {
  await ensureConnected();
  const listings = await Listing.find({}, { name: 1, uid: 1, hsnCode: 1, sellingPrice: 1, priceINR: 1, gstRate: 1, source: 1 }).lean();

  const rows: string[] = ['listingId,uid,name,source,hsnCode,sellingPrice,oldGstRate,newGstRate,needsReview,changed,reason'];
  let changed = 0;
  let needsReview = 0;
  const updates: { id: unknown; fields: ReturnType<typeof gstFieldsFor> }[] = [];

  for (const l of listings as any[]) {
    const price = parseAmount(l.sellingPrice) ?? parseAmount(l.priceINR);
    const fields = gstFieldsFor(l.hsnCode, price);
    const oldRate = parseAmount(l.gstRate);
    const isChanged = oldRate !== fields.gstRate || typeof l.gstRate !== 'number';
    if (isChanged) changed++;
    if (fields.gstNeedsReview) needsReview++;
    updates.push({ id: l._id, fields });
    rows.push([l._id, l.uid, l.name, l.source ?? 'manual', l.hsnCode ?? '', price ?? '', l.gstRate ?? '', fields.gstRate ?? '', fields.gstNeedsReview, isChanged, fields.gstReason].map(csv).join(','));
  }

  fs.writeFileSync(outPath, rows.join('\n') + '\n');
  console.log(`GST table ${GST_TABLE_VERSION}: ${listings.length} listings, ${changed} would change, ${needsReview} need review.`);
  console.log(`Report written to ${outPath}`);

  if (apply) {
    for (const u of updates) {
      await Listing.updateOne({ _id: u.id }, { $set: u.fields });
    }
    console.log(`Applied GST fields to ${updates.length} listings.`);
  } else {
    console.log('Dry run — nothing was written. Re-run with --apply after reviewing the report.');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
