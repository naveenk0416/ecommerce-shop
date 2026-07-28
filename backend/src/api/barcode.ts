import express from 'express';
import { authMiddleware } from './auth.js';

const router = express.Router();

interface UpcItemDbItem {
  title?: string;
  brand?: string;
  category?: string;
  description?: string;
  color?: string;
  size?: string;
  weight?: string;
  images?: string[];
  lowest_recorded_price?: number;
  highest_recorded_price?: number;
  currency?: string;
}

interface UpcItemDbResponse {
  code: string;
  items?: UpcItemDbItem[];
}

// Free, keyless UPCitemdb "trial" endpoint — rate-limited per IP, no signup required.
const UPCITEMDB_TRIAL_URL = 'https://api.upcitemdb.com/prod/trial/lookup';

router.get('/:code/lookup', authMiddleware, async (req, res) => {
  const code = String(req.params.code);

  if (!/^\d{8,14}$/.test(code)) {
    res.status(400).json({ error: 'Barcode must be 8-14 digits (UPC/EAN).' });
    return;
  }

  try {
    const upstream = await fetch(`${UPCITEMDB_TRIAL_URL}?upc=${encodeURIComponent(code)}`);

    if (upstream.status === 429) {
      res.status(429).json({ error: 'Barcode lookup rate limit reached. Please try again shortly.' });
      return;
    }

    const data = (await upstream.json()) as UpcItemDbResponse;
    const item = data.items?.[0];

    if (data.code !== 'OK' || !item) {
      res.json({ found: false, barcode: code });
      return;
    }

    res.json({
      found: true,
      barcode: code,
      title: item.title || null,
      brand: item.brand || null,
      category: item.category || null,
      description: item.description || null,
      color: item.color || null,
      size: item.size || null,
      weight: item.weight || null,
      images: Array.isArray(item.images) ? item.images.slice(0, 3) : [],
      lowestPrice: item.lowest_recorded_price ?? null,
      highestPrice: item.highest_recorded_price ?? null,
      currency: item.currency || null,
    });
  } catch (err: any) {
    console.error('Barcode lookup error', err);
    res.status(502).json({ error: err?.message || 'Barcode lookup service unavailable. Please try again.' });
  }
});

export default router;
