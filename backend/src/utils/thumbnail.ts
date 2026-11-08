import sharp from 'sharp';

/** Edge length (px) of list-row thumbnails: 2× the 40px Inventory cell, for sharp screens. */
export const THUMB_SIZE = 96;

// Small in-memory cache keyed by listing/variant/version, so a polled list doesn't re-encode the
// same images. Bounded by entry count; thumbnails are ~2–5 KB each.
const MAX_ENTRIES = 500;
const cache = new Map<string, Buffer>();

/** A square WebP thumbnail of an image buffer (cover-cropped, never upscaled). */
export async function makeThumbnail(key: string, image: Buffer): Promise<Buffer> {
  const hit = cache.get(key);
  if (hit) {
    // Refresh recency.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const thumb = await sharp(image, { failOn: 'none' })
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
  cache.set(key, thumb);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  return thumb;
}
