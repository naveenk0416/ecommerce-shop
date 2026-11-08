import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { makeThumbnail, THUMB_SIZE } from './thumbnail.js';

test('makeThumbnail returns a small square WebP and caches by key', async () => {
  const big = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#c0392b' } }).jpeg().toBuffer();
  const thumb = await makeThumbnail('t1', big);
  const meta = await sharp(thumb).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, THUMB_SIZE);
  assert.equal(meta.height, THUMB_SIZE);
  assert.ok(thumb.length < big.length);
  assert.equal(await makeThumbnail('t1', Buffer.from('ignored')), thumb);
});
