/**
 * Sizes & colours: gives every inventory item without variants its one default variant
 * (size and colour empty, stock = its current quantity, SKU = its SKU).
 *
 * Dry run by default — nothing is written:
 *   npx tsx src/scripts/migrate-variants.ts
 * Then apply it:
 *   npx tsx src/scripts/migrate-variants.ts --apply
 *
 * Safe to run more than once: items that already have variants are skipped. The app reads
 * items without variants the same way, so running it is tidy-up, not a requirement.
 */
import '../utils/env.js';
import mongoose from 'mongoose';
import { ensureConnected, Listing } from '../api/common.js';
import { defaultVariant } from '../utils/variants.js';
import { parseAmount } from '../utils/listing-fields.js';

const apply = process.argv.slice(2).includes('--apply');

async function main() {
  await ensureConnected();
  const missing = await Listing.find(
    { $or: [{ variants: { $exists: false } }, { variants: { $size: 0 } }] },
    { quantity: 1, sku: 1 },
  ).lean() as any[];
  console.log(`${missing.length} inventory item(s) without variants.`);
  if (!apply) {
    console.log('Dry run — nothing changed. Run with --apply to write them.');
    return;
  }
  let done = 0;
  for (const l of missing) {
    const stock = Math.max(0, Math.trunc(parseAmount(l.quantity) ?? 0));
    const res = await Listing.updateOne(
      { _id: l._id, $or: [{ variants: { $exists: false } }, { variants: { $size: 0 } }] },
      { $set: { variants: [defaultVariant(typeof l.sku === 'string' ? l.sku : '', stock)] } },
    );
    done += res.modifiedCount;
  }
  console.log(`Added a default variant to ${done} item(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
