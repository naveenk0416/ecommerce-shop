import express from 'express';
import { authMiddleware } from './auth.js';
import { ensureConnected, SizeChart } from './common.js';

/**
 * Optional size chart (chest / length … per size), entered once per brand + category and
 * reused for every product of that brand and category.
 */
const router = express.Router();

const MAX_MEASURES = 6;
const MAX_ROWS = 30;

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** "Rangoli Kurtis" + "Women > Kurtis" → "rangoli kurtis|women kurtis". */
export function chartKey(brand: string, category: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${norm(brand)}|${norm(category)}`;
}

function toClient(chart: any) {
  return chart
    ? { brand: chart.brand, category: chart.category, unit: chart.unit, measures: chart.measures ?? [], rows: (chart.rows ?? []).map((r: any) => ({ size: r.size, values: r.values ?? [] })) }
    : null;
}

router.get('/', authMiddleware, async (req, res) => {
  await ensureConnected();
  const uid = (req as any).authUser._id.toString();
  const brand = clean(req.query['brand'], 80);
  const category = clean(req.query['category'], 120);
  const chart = await SizeChart.findOne({ uid, key: chartKey(brand, category) }).lean();
  res.json({ chart: toClient(chart) });
});

router.put('/', authMiddleware, async (req, res) => {
  const b = req.body || {};
  const brand = clean(b.brand, 80);
  const category = clean(b.category, 120);
  if (!category) {
    res.status(400).json({ error: 'Choose the category first.', field: 'category' });
    return;
  }
  const measures = (Array.isArray(b.measures) ? b.measures : []).map((m: unknown) => clean(m, 30)).filter(Boolean).slice(0, MAX_MEASURES);
  if (!measures.length) {
    res.status(400).json({ error: 'Add at least one measurement (e.g. Chest).', field: 'measures' });
    return;
  }
  const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, MAX_ROWS)
    .map((r: any) => ({
      size: clean(r?.size, 20),
      values: measures.map((_: string, i: number) => clean(Array.isArray(r?.values) ? r.values[i] : '', 12)),
    }))
    .filter((r: { size: string; values: string[] }) => r.size && r.values.some(Boolean));
  const bad = rows.find((r: { values: string[] }) => r.values.some((v) => v && !/^\d+(\.\d+)?(\s*-\s*\d+(\.\d+)?)?$/.test(v)));
  if (bad) {
    res.status(400).json({ error: `Use numbers for ${bad.size} (e.g. 38 or 38-40).`, field: 'rows' });
    return;
  }
  await ensureConnected();
  const uid = (req as any).authUser._id.toString();
  const chart = await SizeChart.findOneAndUpdate(
    { uid, key: chartKey(brand, category) },
    { $set: { brand, category, unit: b.unit === 'cm' ? 'cm' : 'in', measures, rows } },
    { upsert: true, new: true },
  ).lean();
  res.json({ chart: toClient(chart) });
});

export default router;
