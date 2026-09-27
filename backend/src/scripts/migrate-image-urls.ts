/**
 * Moves stored image URLs off the old Render host (ecommerce-shop-dins.onrender.com) onto our own
 * domain (PUBLIC_API_URL / BACKEND_URL, default https://api.sellassist.in). A URL that points at
 * one of our own draft images is replaced by a copy of that image, so it no longer depends on any
 * host at all.
 *
 *   npm run images:migrate            # dry run: prints what would change, writes nothing
 *   npm run images:migrate -- --apply # writes the changes
 */
import '../utils/env.js';
import { ensureConnected, Listing, ListingDraft } from '../api/common.js';
import { isRenderUrl, ownImageUrl, publicApiUrl } from '../utils/public-url.js';
import mongoose from 'mongoose';

const apply = process.argv.includes('--apply');
const DRAFT_IMAGE_URL = /\/api\/drafts\/([a-f0-9]{24})\/image\.jpg/i;

async function replacementFor(url: string, uid: string): Promise<{ value: string; how: string }> {
  const draftId = DRAFT_IMAGE_URL.exec(url)?.[1];
  if (draftId) {
    const draft = await ListingDraft.findOne({ _id: draftId, uid }).select('image').lean();
    const image = (draft as any)?.image;
    if (typeof image === 'string' && image.startsWith('data:')) return { value: image, how: 'copied draft image' };
  }
  return { value: ownImageUrl(url), how: `moved to ${publicApiUrl()}` };
}

await ensureConnected();
let changed = 0;

const listings = await Listing.find({ $or: [{ originalImage: /onrender\.com/ }, { processedImage: /onrender\.com/ }] })
  .select('uid name originalImage processedImage').lean() as any[];
for (const listing of listings) {
  const set: Record<string, string> = {};
  for (const field of ['originalImage', 'processedImage']) {
    const value = listing[field];
    if (!isRenderUrl(value)) continue;
    const next = await replacementFor(value, listing.uid);
    set[field] = next.value;
    console.log(`listing ${listing._id} "${String(listing.name || '').slice(0, 40)}" ${field}: ${value} → ${next.how}`);
  }
  if (apply && Object.keys(set).length) await Listing.updateOne({ _id: listing._id }, { $set: set });
  changed += Object.keys(set).length;
}

const drafts = await ListingDraft.find({ image: /onrender\.com/ }).select('uid image').lean() as any[];
for (const draft of drafts) {
  const next = ownImageUrl(draft.image);
  console.log(`draft ${draft._id} image: ${draft.image} → ${next}`);
  if (apply) await ListingDraft.updateOne({ _id: draft._id }, { $set: { image: next } });
  changed += 1;
}

console.log(`${changed} image field(s) ${apply ? 'updated' : 'would change (dry run — add --apply to write)'}.`);
await mongoose.disconnect();
