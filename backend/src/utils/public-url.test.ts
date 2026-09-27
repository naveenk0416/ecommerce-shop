import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRenderUrl, ownImageUrl, publicApiUrl } from './public-url.js';

function withEnv(env: Record<string, string>, fn: () => void) {
  const saved = { PUBLIC_API_URL: process.env['PUBLIC_API_URL'], BACKEND_URL: process.env['BACKEND_URL'] };
  Object.assign(process.env, env);
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('a BACKEND_URL on onrender.com is never used for image links', () => {
  withEnv({ PUBLIC_API_URL: '', BACKEND_URL: 'https://ecommerce-shop-dins.onrender.com' }, () => {
    assert.equal(publicApiUrl(), 'https://api.sellassist.in');
  });
});

test('PUBLIC_API_URL wins, then BACKEND_URL', () => {
  withEnv({ PUBLIC_API_URL: 'https://cdn.example.in/', BACKEND_URL: 'https://api.sellassist.in' }, () => {
    assert.equal(publicApiUrl(), 'https://cdn.example.in');
  });
  withEnv({ PUBLIC_API_URL: '', BACKEND_URL: 'https://api.sellassist.in/' }, () => {
    assert.equal(publicApiUrl(), 'https://api.sellassist.in');
  });
});

test('stored Render image URLs are rewritten to our own domain, others untouched', () => {
  withEnv({ PUBLIC_API_URL: '', BACKEND_URL: 'https://api.sellassist.in' }, () => {
    assert.equal(
      ownImageUrl('https://ecommerce-shop-dins.onrender.com/api/drafts/6ab8e410a3c7a7063bce8158/image.jpg?v=1'),
      'https://api.sellassist.in/api/drafts/6ab8e410a3c7a7063bce8158/image.jpg?v=1',
    );
    assert.equal(ownImageUrl('https://m.media-amazon.com/images/I/x.jpg'), 'https://m.media-amazon.com/images/I/x.jpg');
    assert.equal(ownImageUrl('data:image/jpeg;base64,AAAA'), 'data:image/jpeg;base64,AAAA');
    assert.equal(isRenderUrl('https://x.onrender.com/a'), true);
    assert.equal(isRenderUrl('https://api.sellassist.in/a'), false);
  });
});
