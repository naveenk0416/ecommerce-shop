import express from 'express';
import { authMiddleware } from './auth.js';
import { ensureConnected, FeatureInterest } from './common.js';
import { NOTIFY_FEATURES, publishFlags, type NotifyFeature } from '../config/features.js';

/** Which publish channels are live, and "Notify me" sign-ups for the ones that aren't. */
const router = express.Router();

function uidOf(req: express.Request): string {
  return (req as any).authUser._id.toString();
}

/** Public: the UI decides what to enable from this, so going live is a backend config change. */
router.get('/', (_req, res) => {
  res.json({ publish: publishFlags() });
});

/** The features this seller has already asked to be told about. */
router.get('/notify-me', authMiddleware, async (req, res) => {
  await ensureConnected();
  const rows = await FeatureInterest.find({ uid: uidOf(req) }).select('feature').lean() as Array<{ feature: string }>;
  res.json({ features: rows.map((r) => r.feature) });
});

/** Records {userId, feature, createdAt} once per seller per feature; repeat clicks are a no-op. */
router.post('/notify-me', authMiddleware, async (req, res) => {
  const feature = req.body?.feature;
  if (!NOTIFY_FEATURES.includes(feature as NotifyFeature)) {
    res.status(400).json({ error: 'Unknown feature.' });
    return;
  }
  await ensureConnected();
  const uid = uidOf(req);
  try {
    const result = await FeatureInterest.updateOne({ uid, feature }, { $setOnInsert: { uid, feature } }, { upsert: true });
    res.json({ ok: true, alreadyRequested: result.upsertedCount === 0 });
  } catch (err: any) {
    // Two clicks racing: the unique index lets exactly one insert win.
    if (err?.code === 11000) {
      res.json({ ok: true, alreadyRequested: true });
      return;
    }
    throw err;
  }
});

export default router;
