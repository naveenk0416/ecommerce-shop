import express from 'express';
import jwt from 'jsonwebtoken';
import { calculateGst, normalizeHsn } from '../utils/gst.js';
import { ensureConnected, GstLookup } from './common.js';
import { dayKey } from '../config/coins.js';

const router = express.Router();
const JWT_SECRET = process.env['JWT_SECRET'] || 'dev_jwt_secret_change_me';

/** Signed-in sellers' lookups are counted (one per HSN per day) for "SellAssist saved you X hours". */
function countLookup(req: express.Request, hsn: string): void {
  const header = req.headers.authorization;
  if (!hsn || !header?.startsWith('Bearer ')) return;
  let uid: string;
  try {
    uid = (jwt.verify(header.slice(7), JWT_SECRET) as { uid: string }).uid;
  } catch {
    return;
  }
  ensureConnected()
    .then(() => GstLookup.updateOne({ uid, hsn, day: dayKey() }, { $setOnInsert: { uid, hsn, day: dayKey() } }, { upsert: true }))
    .catch((err: unknown) => {
      if ((err as { code?: number })?.code !== 11000) console.error('GST lookup count failed', err);
    });
}

// Public: the listing editor calls this while the seller types an HSN code or price.
// Listings are always re-priced server-side on save (see listing.ts), so this is display-only.
router.get('/rate', (req, res) => {
  const result = calculateGst(req.query['hsn'], req.query['price']);
  if (result.rate !== null) countLookup(req, normalizeHsn(req.query['hsn']) ?? '');
  res.json(result);
});

export default router;
