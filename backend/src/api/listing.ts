import express from 'express';
import { authMiddleware } from './auth.js';
import { ensureConnected, Listing, ListingDraft, Sale } from './common.js';
import { gstFieldsFor, normalizeListingNumbers, parseAmount } from '../utils/listing-fields.js';

const router = express.Router();

function backendUrl() {
  return (process.env['BACKEND_URL'] || 'http://localhost:4000').replace(/\/$/, '');
}

// Matches URLs produced by listImageUrl below — used to stop a client that echoes a listing
// fetched from the list endpoint back in a PATCH from overwriting the stored base64 image with
// a URL pointing at itself.
const OWN_IMAGE_URL = /\/api\/listings\/[^/]+\/image\.jpg/;

function listImageUrl(id: string, variant: 'original' | 'processed', version: number) {
  return `${backendUrl()}/api/listings/${id}/image.jpg?variant=${variant}&v=${version}`;
}

// For a stored image field: base64 data URIs are swapped for a marker + length inside Mongo so
// the (often multi-hundred-KB) image never leaves the database on a list query; external URLs
// (Amazon-synced images) pass through unchanged.
function imageProjection(field: string) {
  return {
    $cond: [
      { $eq: [{ $substrCP: [{ $ifNull: [`$${field}`, ''] }, 0, 5] }, 'data:'] },
      { __dataLen: { $strLenCP: `$${field}` } },
      `$${field}`,
    ],
  };
}

/** GST fields are always computed server-side from HSN + selling price — never taken from the client or the AI. */
const SERVER_GST_FIELDS = ['gstRate', 'gstNeedsReview', 'gstReason', 'gstTableVersion'];

/** A single listing as the list endpoint returns it: images as URLs, never inline base64. */
function toClientListing(doc: any) {
  const obj = typeof doc?.toObject === 'function' ? doc.toObject({ virtuals: true }) : { ...doc };
  const id = obj._id?.toString();
  const asUrl = (variant: 'original' | 'processed', value: unknown) =>
    typeof value === 'string' && value.startsWith('data:') ? listImageUrl(id, variant, value.length) : value;
  return { ...obj, id, originalImage: asUrl('original', obj.originalImage), processedImage: asUrl('processed', obj.processedImage) };
}

// Returns every listing with image fields as fetchable URLs rather than inline base64. The list
// is polled every few seconds by the frontend; shipping full base64 images on every poll made
// responses tens of MB, overlapping polls piled up, and the server started timing out (504s) —
// which also slowed the public image route Amazon's crawler fetches listing images from.
router.get('/', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  if (!authUser) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const isAdmin = authUser.role === 'ADMIN';
  const allRequested = req.query.all === 'true';
  const filter = allRequested && isAdmin ? {} : { uid: authUser._id.toString() };

  try {
    const listings = await Listing.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $addFields: { originalImage: imageProjection('originalImage'), processedImage: imageProjection('processedImage') } },
    ]);
    const toUrl = (id: string, variant: 'original' | 'processed', value: any) =>
      value && typeof value === 'object' && '__dataLen' in value ? listImageUrl(id, variant, value.__dataLen) : value;
    res.json(listings.map((listing) => {
      const id = listing._id?.toString();
      return {
        ...listing,
        id,
        originalImage: toUrl(id, 'original', listing.originalImage),
        processedImage: toUrl(id, 'processed', listing.processedImage),
      };
    }));
  } catch (err: any) {
    console.error('List listings error', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch listings' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  const { id } = req.params;

  if (!authUser) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const listing = await Listing.findById(id).lean();
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    if ((listing as any).uid?.toString() !== authUser._id.toString() && authUser.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    res.json({ ...listing, id: (listing as any)._id?.toString() });
  } catch (err: any) {
    console.error('Get listing error', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch listing' });
  }
});

// Deliberately unauthenticated — Amazon's own servers fetch this URL directly (via
// main_product_image_locator) to pull the product image when creating a listing, and can't carry
// our auth header. Images are stored as base64 data URIs (this app has no image host/CDN), which
// Amazon's Listings API can't accept inline — it only takes a fetchable URL, so this decodes the
// stored data URI back into real image bytes on the fly. A synced-from-Amazon listing's image is
// already a real URL (from the merchant report/catalog lookup), so that case just redirects.
//
// The path ends in a literal ".jpg" — not a dynamic :ext param, which under Express 5's newer
// path-to-regexp parsing (two params split only by a literal dot) was mis-parsing :id and 500ing
// on every request. A fixed literal suffix sidesteps that entirely; the response's real
// Content-Type always reflects the actual stored image regardless of the URL's extension. The
// suffix itself exists because a URL with no recognizable image extension was confirmed, via live
// Seller Central listings, to leave Amazon showing "No image available" days after publish
// despite this route serving a verified-valid image — Amazon's own image crawler appears to sniff
// the URL path for an extension rather than trusting the Content-Type header alone.
router.get('/:id/image.jpg', async (req, res) => {
  await ensureConnected();
  try {
    // ?variant=original|processed is used by the list endpoint's image URLs; with no variant
    // (Amazon's main_product_image_locator) it serves the processed image, falling back to original.
    const variant = req.query['variant'];
    const fields = variant === 'original' ? 'originalImage' : variant === 'processed' ? 'processedImage' : 'processedImage originalImage';
    const listing = await Listing.findById(req.params['id']).select(fields).lean();
    const source = variant === 'original'
      ? (listing as any)?.originalImage
      : (listing as any)?.processedImage || (variant ? '' : (listing as any)?.originalImage);
    if (!source) {
      res.status(404).end();
      return;
    }

    if (/^https?:\/\//i.test(source)) {
      res.redirect(source);
      return;
    }

    const match = /^data:([^;]+);base64,(.+)$/.exec(source);
    if (!match) {
      res.status(404).end();
      return;
    }
    const [, contentType, base64Data] = match;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(base64Data, 'base64'));
  } catch (err: any) {
    console.error('Serve listing image error', err);
    res.status(500).end();
  }
});

router.post('/', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  if (!authUser) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const body = { ...(req.body || {}) };
  delete body.uid;
  delete body._id;
  delete body.id;
  for (const field of SERVER_GST_FIELDS) delete body[field];

  const { values, error } = normalizeListingNumbers(body);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  try {
    const listing = new Listing({
      ...body,
      ...values,
      ...gstFieldsFor(body.hsnCode, values['sellingPrice'] ?? parseAmount(body.priceINR)),
      uid: authUser._id.toString(),
      createdAt: new Date().toISOString(),
    });
    await listing.save();
    res.json(toClientListing(listing));
  } catch (err: any) {
    console.error('Save listing error', err);
    res.status(500).json({ error: err?.message || 'Failed to save listing' });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  const { id } = req.params;

  if (!authUser) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const listing = await Listing.findById(id);
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    if (listing.uid.toString() !== authUser._id.toString() && authUser.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const updates = { ...req.body };
    delete (updates as any).uid;
    delete (updates as any)._id;
    delete (updates as any).id;
    for (const field of ['originalImage', 'processedImage']) {
      if (typeof (updates as any)[field] === 'string' && OWN_IMAGE_URL.test((updates as any)[field])) {
        delete (updates as any)[field];
      }
    }

    for (const field of SERVER_GST_FIELDS) delete (updates as any)[field];
    const { values, error } = normalizeListingNumbers(updates, listing.toObject());
    if (error) {
      res.status(400).json({ error });
      return;
    }

    // doc.set(), not Object.assign: with strict:false, assigning a property that isn't declared in
    // the schema (quantity, sellingPrice, mrp…) only changes the JS object and is never saved —
    // that's why stock updates after a sale used to be silently lost.
    listing.set({ ...updates, ...values });
    // Recalculate whenever the inputs change, or the stored rate is a legacy string like "18%".
    if ('hsnCode' in updates || 'sellingPrice' in values || typeof listing.get('gstRate') !== 'number') {
      listing.set(gstFieldsFor(listing.get('hsnCode'), listing.get('sellingPrice') ?? parseAmount(listing.get('priceINR'))));
    }
    await listing.save();
    res.json(toClientListing(listing));
  } catch (err: any) {
    console.error('Update listing error', err);
    res.status(500).json({ error: err?.message || 'Failed to update listing' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  const { id } = req.params;

  if (!authUser) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const listing = await Listing.findById(id);
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    if (listing.uid.toString() !== authUser._id.toString() && authUser.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    await listing.deleteOne();
    // The full listing content stays in My Listings, back to draft status.
    await ListingDraft.updateMany({ inventoryListingId: listing._id.toString() }, { $unset: { inventoryListingId: 1 }, $set: { status: 'draft' } });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Delete listing error', err);
    res.status(500).json({ error: err?.message || 'Failed to delete listing' });
  }
});

router.post('/:id/sales', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  const { id } = req.params;
  const saleData = req.body || {};

  if (!authUser) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const quantity = Number(saleData.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    res.status(400).json({ error: 'Quantity sold must be a whole number of 1 or more.' });
    return;
  }
  const salePrice = parseAmount(saleData.salePrice) ?? 0;
  if (salePrice < 0) {
    res.status(400).json({ error: "Sale price can't be negative." });
    return;
  }

  try {
    const listing = await Listing.findById(id);
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    if (listing.uid.toString() !== authUser._id.toString() && authUser.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // Older listings may hold stock as text ("50 units") — store it as a number first so the
    // conditional $inc below can compare against it.
    const storedQty = listing.get('quantity');
    if (typeof storedQty !== 'number') {
      await Listing.updateOne({ _id: id, quantity: storedQty }, { $set: { quantity: Math.max(0, Math.trunc(parseAmount(storedQty) ?? 0)) } });
    }

    // Atomic: only decrements when enough stock remains, so two simultaneous sales can't oversell.
    const before = await Listing.findOneAndUpdate(
      { _id: id, quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity } },
      { new: false, projection: { quantity: 1 } },
    );
    if (!before) {
      const current = await Listing.findById(id, { quantity: 1 }).lean();
      const inStock = Number((current as any)?.quantity ?? 0);
      res.status(409).json({ error: `Only ${inStock} unit${inStock === 1 ? '' : 's'} in stock — you can't sell ${quantity}.`, stock: inStock });
      return;
    }

    let sale;
    try {
      sale = await new Sale({
        listingId: id,
        uid: authUser._id.toString(),
        platform: saleData.platform || 'Other',
        quantity,
        salePrice,
        date: saleData.date || new Date().toISOString(),
      }).save();
    } catch (saveErr) {
      // Put the stock back if the sale record couldn't be written.
      await Listing.updateOne({ _id: id }, { $inc: { quantity } });
      throw saveErr;
    }

    const updated = await Listing.findById(id);
    res.json({
      sale,
      previousStock: Number(before.get('quantity')),
      stock: Number(updated?.get('quantity') ?? 0),
      listing: updated ? toClientListing(updated) : null,
    });
  } catch (err: any) {
    console.error('Log sale error', err);
    res.status(500).json({ error: err?.message || 'Failed to log sale' });
  }
});

router.get('/:id/sales', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  const { id } = req.params;

  if (!authUser) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const listing = await Listing.findById(id);
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    if (listing.uid.toString() !== authUser._id.toString() && authUser.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const sales = await Sale.find({ listingId: id }).sort({ date: -1 }).lean();
    res.json(sales);
  } catch (err: any) {
    console.error('Fetch sales error', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch sales' });
  }
});

export default router;
