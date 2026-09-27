import express from 'express';
import { calculateGst } from '../utils/gst.js';

const router = express.Router();

// Public, no database: the listing editor calls this while the seller types an HSN code or price.
// Listings are always re-priced server-side on save (see listing.ts), so this is display-only.
router.get('/rate', (req, res) => {
  res.json(calculateGst(req.query['hsn'], req.query['price']));
});

export default router;
