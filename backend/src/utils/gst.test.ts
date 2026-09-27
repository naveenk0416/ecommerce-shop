import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateGst, normalizeHsn } from './gst.js';

test('₹499 cotton kurti (6204) → 5%', () => {
  const r = calculateGst('62044220', 499);
  assert.equal(r.rate, 5);
  assert.equal(r.needsReview, false);
  assert.match(r.reason, /^5% — .*≤ ₹2,500 per piece \(GST 2\.0\)$/);
});

test('₹3,000 kurta (6204) → 18%', () => {
  const r = calculateGst('6204', 3000);
  assert.equal(r.rate, 18);
  assert.match(r.reason, /> ₹2,500 per piece/);
});

test('exactly ₹2,500 is still 5% (threshold is "up to")', () => {
  assert.equal(calculateGst('6109', 2500).rate, 5);
});

test('unknown HSN → needs review, no rate', () => {
  const r = calculateGst('99999999', 499);
  assert.equal(r.rate, null);
  assert.equal(r.needsReview, true);
  assert.match(r.reason, /Needs review/);
});

test('missing HSN → needs review', () => {
  const r = calculateGst('', 499);
  assert.equal(r.rate, null);
  assert.equal(r.needsReview, true);
});

test('price-dependent category without a price → needs review', () => {
  const r = calculateGst('6204', undefined);
  assert.equal(r.rate, null);
  assert.equal(r.needsReview, true);
});

test('footwear uses per-pair threshold', () => {
  assert.equal(calculateGst('6403', 1999).rate, 5);
  assert.equal(calculateGst('6403', 2999).rate, 18);
});

test('longest HSN prefix wins (cotton handbag 420222 vs 4202)', () => {
  assert.equal(calculateGst('42022210', 500).rate, 5);
  assert.equal(calculateGst('42021110', 500).rate, 18);
});

test('steel water bottle 7323 → 5%, imitation jewellery 7117 → 3% flagged for review', () => {
  assert.equal(calculateGst('73239390', 350).rate, 5);
  const j = calculateGst('7117', 299);
  assert.equal(j.rate, 3);
  assert.equal(j.needsReview, true);
});

test('HSN with spaces/dots is normalised', () => {
  assert.equal(normalizeHsn('6204 42.20'), '62044220');
  assert.equal(calculateGst('6204 42 20', 499).rate, 5);
});
