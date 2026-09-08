import express from 'express';
import { authMiddleware } from './auth.js';
import { ensureConnected, Listing, Sale } from './common.js';

const router = express.Router();

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
    const listings = await Listing.find(filter).sort({ createdAt: -1 }).lean();
    res.json(listings.map(listing => ({ ...listing, id: listing._id?.toString() })));
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
// The path ends in a literal ".jpg" (matched here as :ext and ignored — the response's real
// Content-Type always reflects the actual stored image, regardless of what extension is in the
// URL) because a URL with no recognizable image extension was confirmed, via live Seller Central
// listings, to leave Amazon showing "No image available" days after publish despite this route
// serving a verified-valid image — Amazon's own image crawler appears to sniff the URL path for
// an extension rather than trusting the Content-Type header alone.
router.get('/:id/image.:ext', async (req, res) => {
  await ensureConnected();
  try {
    const listing = await Listing.findById(req.params['id']).lean();
    const source = (listing as any)?.processedImage || (listing as any)?.originalImage;
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

  try {
    const listing = new Listing({
      ...req.body,
      uid: authUser._id.toString(),
      createdAt: new Date().toISOString(),
    });
    await listing.save();
    const result = {
      ...listing.toObject({ virtuals: true }),
      id: listing._id.toString(),
    };
    res.json(result);
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

    Object.assign(listing, updates);
    await listing.save();
    const result = {
      ...listing.toObject({ virtuals: true }),
      id: listing._id.toString(),
    };
    res.json(result);
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

    const sale = new Sale({
      listingId: id,
      uid: authUser._id.toString(),
      platform: saleData.platform || 'Other',
      quantity: saleData.quantity || 0,
      salePrice: saleData.salePrice || 0,
      date: saleData.date || new Date().toISOString(),
    });
    await sale.save();
    res.json(sale);
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
