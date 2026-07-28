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
