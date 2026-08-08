import express from 'express';
import bcrypt from 'bcryptjs';
import { authMiddleware } from './auth.js';
import { ensureConnected, Listing, User } from './common.js';

const router = express.Router();

router.post('/users', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  if (!authUser || authUser.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { email, password, displayName, phoneNumber, gstNumber, role } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      email,
      passwordHash,
      displayName,
      phoneNumber: phoneNumber || undefined,
      gstNumber,
      role: role === 'ADMIN' || role === 'PAID_PRO' ? role : 'FREE',
    });
    await user.save();

    res.json({
      uid: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber,
      gstNumber: user.gstNumber,
      role: user.role,
      usageCount: user.usageCount,
    });
  } catch (err: any) {
    console.error('Create admin user error', err);
    res.status(500).json({ error: err?.message || 'Failed to create user' });
  }
});

router.delete('/users/:id', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  const { id } = req.params;

  if (!authUser || authUser.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if (authUser._id.toString() === id) {
    res.status(400).json({ error: 'You cannot delete your own account.' });
    return;
  }

  try {
    const target = await User.findById(id);
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (target.role === 'ADMIN') {
      const adminCount = await User.countDocuments({ role: 'ADMIN' });
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot delete the last remaining admin.' });
        return;
      }
    }

    await target.deleteOne();
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Delete admin user error', err);
    res.status(500).json({ error: err?.message || 'Failed to delete user' });
  }
});

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

router.post('/listings', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  if (!authUser || authUser.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { uid, name } = req.body || {};
  if (!uid || !name) {
    res.status(400).json({ error: 'uid and name are required' });
    return;
  }

  try {
    const owner = await User.findById(uid).lean();
    if (!owner) {
      res.status(404).json({ error: 'Owner user not found' });
      return;
    }

    const listing = new Listing({
      ...req.body,
      createdAt: new Date().toISOString(),
    });
    await listing.save();
    res.json({ ...listing.toObject({ virtuals: true }), id: listing._id.toString() });
  } catch (err: any) {
    console.error('Create admin listing error', err);
    res.status(500).json({ error: err?.message || 'Failed to create listing' });
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
