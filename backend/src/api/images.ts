import express from 'express';
import mongoose from 'mongoose';
import { ensureConnected, ProductImage } from './common.js';

/**
 * Product photos (batch uploads and per-colour photos) at /api/images/:id.jpg. Public like
 * /api/drafts/:id/image.jpg: <img> tags, marketplace bulk files and Amazon's crawler can't send
 * our auth header. Ids are unguessable ObjectIds and the photo is the seller's own product shot.
 */
const router = express.Router();

router.get('/:id.jpg', async (req, res) => {
  try {
    const id = String(req.params['id']);
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).end();
      return;
    }
    await ensureConnected();
    const image = await ProductImage.findById(id).select('data').lean() as any;
    const match = typeof image?.data === 'string' ? /^data:([^;]+);base64,(.+)$/.exec(image.data) : null;
    if (!match) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', match[1]);
    // A photo never changes under the same id.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(match[2], 'base64'));
  } catch (err) {
    console.error('Serve product image error', err);
    res.status(500).end();
  }
});

export default router;
