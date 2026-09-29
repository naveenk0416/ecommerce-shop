import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { ensureConnected } from './common.js';
import { CLIENT_FUNNEL_EVENTS, recordFunnelEvent, type FunnelEventName } from '../utils/funnel.js';
import { deviceId } from '../utils/request-identity.js';

/** Funnel steps reported by the browser (landing_view, signup_view, …). No account needed. */
const router = express.Router();

const eventsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || ''),
  message: { error: 'Too many events.' },
});

router.post('/', eventsLimiter, async (req, res) => {
  const name = req.body?.name;
  const device = deviceId(req);
  if (!CLIENT_FUNNEL_EVENTS.includes(name) || !device) {
    res.status(400).json({ error: 'Unknown event.' });
    return;
  }
  await ensureConnected();
  await recordFunnelEvent(name as FunnelEventName, { deviceId: device, utm_source: req.body?.utm_source, utm_campaign: req.body?.utm_campaign });
  res.status(204).end();
});

export default router;
