import express from 'express';
import { authMiddleware } from './auth';
import { ensureConnected, Listing, User } from './common';

const router = express.Router();

router.get('/users', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  if (!authUser || authUser.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const users = await User.find().lean();
    res.json(users.map((user: any) => ({
      uid: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber,
      gstNumber: user.gstNumber,
      role: user.role,
      usageCount: user.usageCount,
      lastLogin: user.lastLogin,
      dailyStats: user.dailyStats,
    })));
  } catch (err: any) {
    console.error('Fetch admin users error', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch users' });
  }
});

router.get('/listings', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  if (!authUser || authUser.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const listings = await Listing.find().sort({ createdAt: -1 }).lean();
    res.json(listings.map(listing => ({ ...listing, id: listing._id?.toString() })));
  } catch (err: any) {
    console.error('Fetch admin listings error', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch listings' });
  }
});

router.delete('/listings/:id', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  const { id } = req.params;

  if (!authUser || authUser.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const listing = await Listing.findById(id);
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    await listing.deleteOne();
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Delete admin listing error', err);
    res.status(500).json({ error: err?.message || 'Failed to delete listing' });
  }
});

router.patch('/listings/:id', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  const { id } = req.params;

  if (!authUser || authUser.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const listing = await Listing.findById(id);
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    const updates = { ...req.body };
    delete (updates as any).uid;
    delete (updates as any)._id;
    delete (updates as any).id;

    Object.assign(listing, updates);
    await listing.save();
    res.json({ ...listing.toObject({ virtuals: true }), id: listing._id.toString() });
  } catch (err: any) {
    console.error('Update admin listing error', err);
    res.status(500).json({ error: err?.message || 'Failed to update listing' });
  }
});

export default router;
