import express from 'express';
import { authMiddleware } from './auth.js';
import { AbuseEvent, AiUsage, CoinLedger, CoinOrder, ensureConnected, FeatureInterest, FunnelEvent, GuestDraft, GuestUsage, PackInterest, User } from './common.js';
import { coinConfig, dayKey, packsEnabled } from '../config/coins.js';
import { NOTIFY_FEATURES } from '../config/features.js';

/**
 * Admin-only growth, coin and AI-cost stats, filterable by sign-up date range and
 * utm_campaign / referral code. CSV exports carry the user id only — never emails, passwords or tokens.
 */
const router = express.Router();
const DAY_MS = 24 * 3600 * 1000;
const BONUS_KEYS = { welcome: 'welcome', mobile: 'bonus:mobile', firstInventorySave: 'bonus:first_inventory_save', firstPublish: 'bonus:first_publish' };

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if ((req as any).authUser?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

interface Filters { from: Date; to: Date; campaign?: string; ref?: string }

function parseFilters(query: express.Request['query']): Filters {
  const to = query['to'] ? new Date(`${query['to']}T23:59:59+05:30`) : new Date();
  const from = query['from'] ? new Date(`${query['from']}T00:00:00+05:30`) : new Date(to.getTime() - 90 * DAY_MS);
  return {
    from: isNaN(from.getTime()) ? new Date(0) : from,
    to: isNaN(to.getTime()) ? new Date() : to,
    campaign: typeof query['campaign'] === 'string' && query['campaign'] ? query['campaign'] : undefined,
    ref: typeof query['ref'] === 'string' && query['ref'] ? query['ref'].toUpperCase() : undefined,
  };
}

function pct(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sizeBucket(count: number): string {
  if (count <= 10) return '1-10';
  if (count <= 50) return '11-50';
  if (count <= 200) return '51-200';
  return '200+';
}

function daysBetween(a: Date, dayString: string): number {
  return Math.floor((new Date(`${dayString}T12:00:00+05:30`).getTime() - new Date(`${dayKey(a)}T12:00:00+05:30`).getTime()) / DAY_MS);
}

async function computeStats(filters: Filters) {
  const userQuery: Record<string, unknown> = { createdAt: { $gte: filters.from, $lte: filters.to } };
  if (filters.campaign) userQuery['attribution.utm_campaign'] = filters.campaign;
  if (filters.ref) userQuery['attribution.ref'] = filters.ref;

  const users = await User.find(userQuery)
    .select('createdAt emailVerified usageCount role attribution catalogSizeBand catalogSizeImported activeDays freeExhaustedAt offerStartedAt hasPurchased referral')
    .lean() as any[];
  const uids = users.map((u) => u._id.toString());

  const [aiRows, ledgerRows, orders, clicks, referredRows, reversals] = await Promise.all([
    AiUsage.find({ uid: { $in: uids } }).select('uid purpose success costInr createdAt').lean() as Promise<any[]>,
    CoinLedger.find({ uid: { $in: uids }, key: { $in: Object.values(BONUS_KEYS) } }).select('uid key').lean() as Promise<any[]>,
    CoinOrder.find({ uid: { $in: uids }, status: 'paid' }).select('uid packId packName amountInr').lean() as Promise<any[]>,
    PackInterest.find({ uid: { $in: uids } }).select('uid').lean() as Promise<any[]>,
    User.find({ 'referral.referrerUid': { $in: uids } }).select('referral').lean() as Promise<any[]>,
    CoinLedger.countDocuments({ uid: { $in: uids }, type: 'referral_reversal' }),
  ]);

  const byUser = new Map<string, any>();
  for (const u of users) {
    byUser.set(u._id.toString(), { listingDates: [] as Date[], cost: 0, bonuses: new Set<string>(), paidInr: 0, clicks: 0, referred: 0 });
  }
  for (const row of aiRows) {
    const entry = byUser.get(row.uid);
    if (!entry) continue;
    entry.cost += row.costInr || 0;
    if (row.purpose === 'listing' && row.success) entry.listingDates.push(new Date(row.createdAt));
  }
  for (const row of ledgerRows) byUser.get(row.uid)?.bonuses.add(row.key);
  for (const row of orders) {
    const entry = byUser.get(row.uid);
    if (entry) entry.paidInr += row.amountInr || 0;
  }
  for (const row of clicks) {
    const entry = byUser.get(row.uid);
    if (entry) entry.clicks += 1;
  }
  for (const row of referredRows) {
    const entry = byUser.get(row.referral.referrerUid);
    if (entry) entry.referred += 1;
  }

  const now = Date.now();
  const perUser = users.map((u) => {
    const uid = u._id.toString();
    const e = byUser.get(uid);
    const signup = new Date(u.createdAt);
    const within = (days: number) => e.listingDates.filter((d: Date) => d.getTime() - signup.getTime() <= days * DAY_MS).length;
    const activeDayOffsets = (u.activeDays ?? []).map((d: string) => daysBetween(signup, d));
    const week2Activity = e.listingDates.some((d: Date) => {
      const offset = Math.floor((d.getTime() - signup.getTime()) / DAY_MS);
      return offset >= 7 && offset <= 13;
    }) || activeDayOffsets.some((o: number) => o >= 7 && o <= 13);
    return {
      userId: uid,
      signupAt: signup.toISOString(),
      verified: !!u.emailVerified,
      utmCampaign: u.attribution?.utm_campaign ?? '',
      ref: u.attribution?.ref ?? '',
      catalogSizeBand: u.catalogSizeBand ?? '',
      catalogSizeImported: typeof u.catalogSizeImported === 'number' ? u.catalogSizeImported : null,
      aiListingsTotal: e.listingDates.length || (u.usageCount ?? 0),
      aiListingsFirst7Days: within(7),
      aiListingsFirst30Days: within(30),
      activated: e.listingDates.length > 0 || (u.usageCount ?? 0) > 0,
      week2Eligible: now - signup.getTime() >= 14 * DAY_MS,
      activeInWeek2: week2Activity,
      usedAllFreeCoins: !!u.freeExhaustedAt,
      notifyClicks: e.clicks,
      bonusWelcome: e.bonuses.has(BONUS_KEYS.welcome),
      bonusMobile: e.bonuses.has(BONUS_KEYS.mobile),
      bonusFirstInventorySave: e.bonuses.has(BONUS_KEYS.firstInventorySave),
      bonusFirstPublish: e.bonuses.has(BONUS_KEYS.firstPublish),
      referredSignups: e.referred,
      referralStatus: u.referral?.status ?? '',
      starterOfferShown: !!u.offerStartedAt,
      paying: e.paidInr > 0,
      revenueInr: e.paidInr,
      aiCostInr: Math.round(e.cost * 100) / 100,
    };
  });

  const signups = perUser.length;
  const verified = perUser.filter((u) => u.verified).length;
  const activated = perUser.filter((u) => u.activated);
  const week2Eligible = perUser.filter((u) => u.week2Eligible && u.activated);
  const paying = perUser.filter((u) => u.paying);

  const bandCounts: Record<string, number> = Object.fromEntries([...coinConfig.catalogSizeBands, 'Not answered'].map((b) => [b, 0]));
  for (const u of perUser) bandCounts[u.catalogSizeBand || 'Not answered'] = (bandCounts[u.catalogSizeBand || 'Not answered'] ?? 0) + 1;

  const imported = perUser.map((u) => u.catalogSizeImported).filter((n): n is number => typeof n === 'number');
  const importedBuckets: Record<string, number> = Object.fromEntries(coinConfig.catalogSizeBands.map((b) => [b, 0]));
  for (const n of imported) importedBuckets[sizeBucket(n)] = (importedBuckets[sizeBucket(n)] ?? 0) + 1;

  const purchasesByPack: Record<string, { name: string; count: number; revenueInr: number }> = {};
  for (const order of orders) {
    purchasesByPack[order.packId] ??= { name: order.packName || order.packId, count: 0, revenueInr: 0 };
    purchasesByPack[order.packId].count += 1;
    purchasesByPack[order.packId].revenueInr += order.amountInr || 0;
  }
  const offersShown = perUser.filter((u) => u.starterOfferShown).length;
  const starterBuyers = new Set(orders.filter((o) => o.packId === coinConfig.packs.starter.id).map((o) => o.uid)).size;

  const totalCost = perUser.reduce((sum, u) => sum + u.aiCostInr, 0);
  const costOf = (list: typeof perUser) => list.reduce((sum, u) => sum + u.aiCostInr, 0);

  const referralStatus: Record<string, number> = { pending: 0, rewarded: 0, blocked: 0 };
  const blockedReasons: Record<string, number> = {};
  for (const row of referredRows) {
    const status = row.referral?.status ?? 'pending';
    referralStatus[status] = (referralStatus[status] ?? 0) + 1;
    if (status === 'blocked') blockedReasons[row.referral.reason || 'unknown'] = (blockedReasons[row.referral.reason || 'unknown'] ?? 0) + 1;
  }

  const aiCostByPurpose = await AiUsage.aggregate([
    { $match: { createdAt: { $gte: filters.from, $lte: filters.to }, ...(filters.campaign || filters.ref ? { uid: { $in: uids } } : {}) } },
    { $group: {
      _id: '$purpose',
      calls: { $sum: 1 },
      successful: { $sum: { $cond: ['$success', 1, 0] } },
      inputTokens: { $sum: '$inputTokens' },
      outputTokens: { $sum: '$outputTokens' },
      costInr: { $sum: '$costInr' },
      avgMs: { $avg: '$durationMs' },
    } },
    { $sort: { _id: 1 } },
  ]);

  // "Notify me" for features that aren't live yet, requested within the date range (and by the
  // campaign / referral cohort when one is set) — one row per seller per feature.
  const featureRows = await FeatureInterest.aggregate([
    { $match: { createdAt: { $gte: filters.from, $lte: filters.to }, ...(filters.campaign || filters.ref ? { uid: { $in: uids } } : {}) } },
    { $group: { _id: '$feature', sellers: { $sum: 1 } } },
  ]);
  const featureNotifyMe: Record<string, number> = Object.fromEntries(NOTIFY_FEATURES.map((f) => [f, 0]));
  for (const row of featureRows) featureNotifyMe[row._id] = row.sellers;

  const funnel = await computeFunnel(filters);
  const abuse = await computeAbuse(filters);

  const summary = {
    filters: { from: filters.from.toISOString(), to: filters.to.toISOString(), campaign: filters.campaign ?? null, ref: filters.ref ?? null },
    signups,
    verifiedPct: pct(verified, signups),
    activationPct: pct(activated.length, signups),
    activatedUsers: activated.length,
    week2RetentionPct: pct(week2Eligible.filter((u) => u.activeInWeek2).length, week2Eligible.length),
    week2EligibleUsers: week2Eligible.length,
    catalogSizeBand: bandCounts,
    catalogSizeImported: {
      users: imported.length,
      median: median(imported),
      average: imported.length ? Math.round((imported.reduce((a, b) => a + b, 0) / imported.length) * 10) / 10 : null,
      buckets: importedBuckets,
    },
    aiListingsPerActiveUserFirst7Days: activated.length ? Math.round((activated.reduce((s, u) => s + u.aiListingsFirst7Days, 0) / activated.length) * 100) / 100 : 0,
    aiListingsPerActiveUserFirst30Days: activated.length ? Math.round((activated.reduce((s, u) => s + u.aiListingsFirst30Days, 0) / activated.length) * 100) / 100 : 0,
    usedAllFreeCoinsPct: pct(perUser.filter((u) => u.usedAllFreeCoins).length, verified),
    notifyMe: { clicks: clicks.length, users: new Set(clicks.map((c) => c.uid)).size },
    featureNotifyMe,
    funnel,
    abuse,
    bonusCompletionPct: {
      welcome: pct(perUser.filter((u) => u.bonusWelcome).length, verified),
      mobile: pct(perUser.filter((u) => u.bonusMobile).length, verified),
      firstInventorySave: pct(perUser.filter((u) => u.bonusFirstInventorySave).length, verified),
      firstPublish: pct(perUser.filter((u) => u.bonusFirstPublish).length, verified),
    },
    referrals: {
      referredSignups: referredRows.length,
      ...referralStatus,
      blockedReasons,
      reversed: reversals,
      signupsFromReferralLinks: perUser.filter((u) => u.ref).length,
    },
    packs: {
      enabled: packsEnabled(),
      purchasesByPack,
      revenueInr: orders.reduce((s, o) => s + (o.amountInr || 0), 0),
      payingUsers: paying.length,
      starterOffersShown: offersShown,
      starterPurchases: starterBuyers,
      starterConversionPct: pct(starterBuyers, offersShown),
    },
    aiCost: {
      totalInr: Math.round(totalCost * 100) / 100,
      perActiveUserInr: activated.length ? Math.round((costOf(activated) / activated.length) * 100) / 100 : 0,
      perPayingUserInr: paying.length ? Math.round((costOf(paying) / paying.length) * 100) / 100 : 0,
      byPurpose: aiCostByPurpose.map((row: any) => ({
        purpose: row._id,
        calls: row.calls,
        successful: row.successful,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        costInr: Math.round(row.costInr * 100) / 100,
        avgSeconds: row.avgMs ? Math.round(row.avgMs / 100) / 10 : null,
      })),
    },
  };
  return { summary, perUser };
}

const FUNNEL_STEPS = ['landing_view', 'signup_view', 'sign_up_start', 'sign_up', 'first_listing_created'] as const;
const GUEST_STEPS = ['guest_try_start', 'guest_try_success', 'guest_try_signup_click'] as const;

/**
 * Visits → sign-up page → started typing → signed up → first listing, per utm_campaign, counted as
 * unique visitors (browser id) per step in the date range. Guest-try steps alongside.
 */
async function computeFunnel(filters: Filters) {
  const match: Record<string, unknown> = { createdAt: { $gte: filters.from, $lte: filters.to }, name: { $in: [...FUNNEL_STEPS, ...GUEST_STEPS] } };
  if (filters.campaign) match['utm_campaign'] = filters.campaign;
  const rows = await FunnelEvent.aggregate([
    { $match: match },
    { $group: { _id: { campaign: { $ifNull: ['$utm_campaign', '(none)'] }, name: '$name' }, visitors: { $addToSet: { $ifNull: ['$deviceId', '$uid'] } } } },
    { $project: { _id: 1, count: { $size: '$visitors' } } },
  ]);
  const byCampaign = new Map<string, Record<string, number>>();
  const totals: Record<string, number> = Object.fromEntries([...FUNNEL_STEPS, ...GUEST_STEPS].map((s) => [s, 0]));
  for (const row of rows) {
    const campaign = row._id.campaign || '(none)';
    if (!byCampaign.has(campaign)) byCampaign.set(campaign, Object.fromEntries([...FUNNEL_STEPS, ...GUEST_STEPS].map((s) => [s, 0])));
    byCampaign.get(campaign)![row._id.name] = row.count;
    totals[row._id.name] += row.count;
  }
  const withRates = (campaign: string, counts: Record<string, number>) => ({
    campaign,
    steps: FUNNEL_STEPS.map((step, i) => ({
      step,
      count: counts[step] ?? 0,
      pctOfPrevious: i === 0 ? null : pct(counts[step] ?? 0, counts[FUNNEL_STEPS[i - 1]] ?? 0),
    })),
    guest: Object.fromEntries(GUEST_STEPS.map((s) => [s, counts[s] ?? 0])),
  });
  const campaigns = [...byCampaign.entries()]
    .sort((a, b) => (b[1]['landing_view'] ?? 0) - (a[1]['landing_view'] ?? 0))
    .map(([campaign, counts]) => withRates(campaign, counts));

  const range = { createdAt: { $gte: filters.from, $lte: filters.to } };
  const [guestSuccess, guestFailed, guestClaimed] = await Promise.all([
    GuestUsage.countDocuments({ ...range, status: 'success' }),
    GuestUsage.countDocuments({ ...range, status: 'failed' }),
    GuestDraft.countDocuments({ ...range, claimedByUid: { $exists: true } }),
  ]);
  return {
    steps: FUNNEL_STEPS,
    total: withRates('All campaigns', totals),
    campaigns,
    guest: { generated: guestSuccess, failed: guestFailed, savedAfterSignup: guestClaimed, limits: coinConfig.guest },
  };
}

/** Suspicious sign-up patterns and unverified accounts to clean up (admin only; ids, never emails). */
async function computeAbuse(filters: Filters) {
  const range = { createdAt: { $gte: filters.from, $lte: filters.to } };
  const [byType, busyIps, busyDevices] = await Promise.all([
    AbuseEvent.aggregate([{ $match: range }, { $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    User.aggregate([
      { $match: { ...range, signupIpHash: { $exists: true } } },
      { $group: { _id: '$signupIpHash', signups: { $sum: 1 }, withoutWelcome: { $sum: { $cond: [{ $eq: ['$welcomeEligible', false] }, 1, 0] } } } },
      { $match: { signups: { $gte: 3 } } }, { $sort: { signups: -1 } }, { $limit: 20 },
    ]),
    User.aggregate([
      { $match: { ...range, signupDeviceId: { $exists: true } } },
      { $group: { _id: '$signupDeviceId', signups: { $sum: 1 } } },
      { $match: { signups: { $gte: 2 } } }, { $sort: { signups: -1 } }, { $limit: 20 },
    ]),
  ]);
  const cutoff = new Date(Date.now() - coinConfig.signup.unverifiedCleanupListAfterDays * DAY_MS);
  const unverifiedQuery = { emailVerified: false, createdAt: { $lt: cutoff } };
  const [unverifiedTotal, unverified] = await Promise.all([
    User.countDocuments(unverifiedQuery),
    User.find(unverifiedQuery).select('createdAt signupMethod usageCount email').sort({ createdAt: 1 }).limit(200).lean() as Promise<any[]>,
  ]);
  return {
    events: Object.fromEntries(byType.map((row: any) => [row._id, row.count])),
    networksWithManySignups: busyIps.map((row: any) => ({ network: String(row._id).slice(0, 10), signups: row.signups, withoutWelcome: row.withoutWelcome })),
    devicesWithManySignups: busyDevices.map((row: any) => ({ device: String(row._id).slice(0, 10), signups: row.signups })),
    unverifiedOlderThanDays: coinConfig.signup.unverifiedCleanupListAfterDays,
    unverifiedTotal,
    unverified: unverified.map((u) => ({
      userId: u._id.toString(),
      createdAt: new Date(u.createdAt).toISOString(),
      emailDomain: String(u.email || '').split('@').pop(),
      aiListings: u.usageCount ?? 0,
    })),
  };
}

router.get('/stats', authMiddleware, requireAdmin, async (req, res) => {
  await ensureConnected();
  const { summary } = await computeStats(parseFilters(req.query));
  res.json(summary);
});

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function flatten(prefix: string, value: unknown, rows: Array<[string, unknown]>): void {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, inner] of Object.entries(value)) flatten(prefix ? `${prefix}.${key}` : key, inner, rows);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => flatten(`${prefix}[${i}]`, item, rows));
  } else {
    rows.push([prefix, value]);
  }
}

/** ?type=users (one row per seller, by user id) or ?type=summary (metric,value). */
router.get('/stats.csv', authMiddleware, requireAdmin, async (req, res) => {
  await ensureConnected();
  const { summary, perUser } = await computeStats(parseFilters(req.query));
  let csv: string;
  if (req.query['type'] === 'summary') {
    const rows: Array<[string, unknown]> = [];
    flatten('', summary, rows);
    csv = ['metric,value', ...rows.map(([k, v]) => `${csvCell(k)},${csvCell(v)}`)].join('\n');
  } else {
    const columns = perUser.length ? Object.keys(perUser[0]) : ['userId'];
    csv = [columns.join(','), ...perUser.map((row: any) => columns.map((c) => csvCell(row[c])).join(','))].join('\n');
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sellassist-stats-${req.query['type'] === 'summary' ? 'summary' : 'users'}-${dayKey()}.csv"`);
  res.send(csv);
});

export default router;
