import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from './auth.js';
import { ensureConnected, Listing, ListingDraft } from './common.js';
import { ownImageUrl, publicApiUrl } from '../utils/public-url.js';

const router = express.Router();

const MAX_IMAGE_CHARS = 8 * 1024 * 1024;
const TABS = ['general', 'amazon', 'flipkart', 'meesho', 'instagram'];

function imageUrl(id: string, image: string | undefined, updatedAt?: Date) {
  if (!image) return null;
  if (/^https?:\/\//i.test(image)) return ownImageUrl(image);
  return `${publicApiUrl()}/api/drafts/${id}/image.jpg?v=${updatedAt ? new Date(updatedAt).getTime() : image.length}`;
}

/** Only known tabs, each an object of field → { values, confidence, reason }. */
function sanitizeResults(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out: Record<string, unknown> = {};
  for (const tab of TABS) {
    const value = (input as Record<string, unknown>)[tab];
    if (value && typeof value === 'object' && !Array.isArray(value)) out[tab] = value;
  }
  return out;
}

function validImage(image: unknown): string | null | undefined {
  if (image === undefined) return undefined;
  if (image === null || image === '') return '';
  if (typeof image !== 'string' || image.length > MAX_IMAGE_CHARS) return null;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(image)) return image;
  if (/^https?:\/\//i.test(image)) return ownImageUrl(image);
  return null;
}

function titleFrom(results: any, fallback = ''): string {
  const title = results?.general?.productTitle?.values?.[0];
  return (typeof title === 'string' && title.trim() ? title.trim() : fallback).slice(0, 200);
}

async function loadOwned(req: express.Request, res: express.Response) {
  const authUser = (req as any).authUser;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ error: 'Listing not found' });
    return null;
  }
  const draft = await ListingDraft.findById(id);
  if (!draft) {
    res.status(404).json({ error: 'Listing not found' });
    return null;
  }
  if (draft.uid !== authUser._id.toString() && authUser.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return draft;
}

function toClient(draft: any, includeResults: boolean) {
  const obj = draft.toObject ? draft.toObject() : draft;
  const id = obj._id.toString();
  return {
    id,
    title: obj.title,
    status: obj.status,
    imageUrl: imageUrl(id, obj.image, obj.updatedAt),
    inventoryListingId: obj.inventoryListingId ?? null,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    ...(includeResults ? { results: obj.results ?? {} } : {}),
  };
}

// "My Listings" — newest first, without the heavy photo or tab content.
router.get('/', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  try {
    const drafts = await ListingDraft.aggregate([
      { $match: { uid: authUser._id.toString() } },
      { $sort: { updatedAt: -1 } },
      { $limit: 500 },
      {
        $project: {
          title: 1, status: 1, inventoryListingId: 1, createdAt: 1, updatedAt: 1,
          // Keep a tiny marker instead of the photo itself.
          image: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$image', ''] } }, 0] }, { $substrCP: ['$image', 0, 8] }, ''] },
        },
      },
    ]);
    res.json(drafts.map((d: any) => toClient(d, false)));
  } catch (err: any) {
    console.error('List drafts error', err);
    res.status(500).json({ error: 'Failed to load your listings' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  await ensureConnected();
  try {
    const draft = await loadOwned(req, res);
    if (draft) res.json(toClient(draft, true));
  } catch (err: any) {
    console.error('Get draft error', err);
    res.status(500).json({ error: 'Failed to load this listing' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  const image = validImage(req.body?.image);
  if (image === null) {
    res.status(400).json({ error: 'The product photo must be an image under 8 MB.' });
    return;
  }
  const results = sanitizeResults(req.body?.results) ?? {};
  try {
    const draft = await new ListingDraft({
      uid: authUser._id.toString(),
      title: titleFrom(results, String(req.body?.title || '')),
      image: image ?? '',
      results,
    }).save();
    res.status(201).json(toClient(draft, true));
  } catch (err: any) {
    console.error('Create draft error', err);
    res.status(500).json({ error: 'Failed to save the draft' });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  await ensureConnected();
  try {
    const draft = await loadOwned(req, res);
    if (!draft) return;

    const results = sanitizeResults(req.body?.results);
    if (results) {
      draft.results = results;
      draft.markModified('results');
      draft.title = titleFrom(results, draft.title);
    }
    const image = validImage(req.body?.image);
    if (image === null) {
      res.status(400).json({ error: 'The product photo must be an image under 8 MB.' });
      return;
    }
    if (image !== undefined) draft.image = image;
    if (req.body?.status === 'draft' || req.body?.status === 'saved') draft.status = req.body.status;
    if (typeof req.body?.inventoryListingId === 'string') draft.inventoryListingId = req.body.inventoryListingId;

    await draft.save();
    res.json(toClient(draft, false));
  } catch (err: any) {
    console.error('Update draft error', err);
    res.status(500).json({ error: 'Failed to save the draft' });
  }
});

router.post('/:id/duplicate', authMiddleware, async (req, res) => {
  await ensureConnected();
  try {
    const draft = await loadOwned(req, res);
    if (!draft) return;
    const copy = await new ListingDraft({
      uid: draft.uid,
      title: `Copy of ${draft.title || 'Untitled product'}`.slice(0, 200),
      image: draft.image,
      results: draft.results,
      status: 'draft',
    }).save();
    res.status(201).json(toClient(copy, false));
  } catch (err: any) {
    console.error('Duplicate draft error', err);
    res.status(500).json({ error: 'Failed to duplicate this listing' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  await ensureConnected();
  try {
    const draft = await loadOwned(req, res);
    if (!draft) return;
    // The inventory item (if any) stays — it just loses its link back to the full content.
    await Listing.updateMany({ draftId: draft._id.toString() }, { $unset: { draftId: 1 } });
    await draft.deleteOne();
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Delete draft error', err);
    res.status(500).json({ error: 'Failed to delete this listing' });
  }
});

// Public like /api/listings/:id/image.jpg — <img> tags can't send the auth header. Draft ids are
// unguessable ObjectIds and the photo is the seller's own product shot.
router.get('/:id/image.jpg', async (req, res) => {
  await ensureConnected();
  try {
    if (!mongoose.isValidObjectId(req.params['id'])) {
      res.status(404).end();
      return;
    }
    const draft = await ListingDraft.findById(req.params['id']).select('image').lean();
    const source = (draft as any)?.image as string | undefined;
    if (!source) {
      res.status(404).end();
      return;
    }
    if (/^https?:\/\//i.test(source)) {
      res.redirect(ownImageUrl(source));
      return;
    }
    const match = /^data:([^;]+);base64,(.+)$/.exec(source);
    if (!match) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', match[1]);
    // Versioned URLs (?v=…) change whenever the image changes, so browsers may keep them forever.
    res.setHeader('Cache-Control', req.query['v'] ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
    res.send(Buffer.from(match[2], 'base64'));
  } catch (err) {
    console.error('Serve draft image error', err);
    res.status(500).end();
  }
});

export default router;
