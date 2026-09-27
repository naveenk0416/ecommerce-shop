import crypto from 'node:crypto';
import { AiUsage, AssistCounter, CoinLedger, GstLookup, PackInterest, User } from '../api/common.js';
import { activeFestivePacks, coinConfig, dayKey, monthKey, monthStart, nextTopUpDate } from '../config/coins.js';

/**
 * Coin wallet rules. Balances live on the User (coins.free / coins.paid); every change is also a
 * CoinLedger row. One-time grants (welcome, bonuses, top-ups, referral rewards, the starter pack)
 * carry a ledger `key`, and the unique {uid, key} index is what makes them happen exactly once —
 * even when two requests race.
 *
 * Spending takes free coins first, then paid ones.
 */

export type BonusId = 'mobile' | 'firstInventorySave' | 'firstPublish';

const BONUS_KEYS: Record<BonusId, string> = {
  mobile: 'bonus:mobile',
  firstInventorySave: 'bonus:first_inventory_save',
  firstPublish: 'bonus:first_publish',
};

const BONUS_REASONS: Record<BonusId, string> = {
  mobile: 'Mobile number added to your profile',
  firstInventorySave: 'First product saved to inventory',
  firstPublish: 'First product published to Amazon or Flipkart',
};

type LedgerType = 'welcome_bonus' | 'monthly_topup' | 'earned_bonus' | 'referral' | 'referral_reversal' | 'spend' | 'refund' | 'purchase' | 'admin_adjust';

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number })?.code === 11000;
}

async function balanceOf(uid: string): Promise<{ free: number; paid: number }> {
  const user = await User.findById(uid).select('coins').lean();
  return { free: user?.coins?.free ?? 0, paid: user?.coins?.paid ?? 0 };
}

/**
 * Credits coins, optionally only once per `key`. Returns false (and changes nothing) if a ledger
 * row with that key already exists.
 */
export async function credit(uid: string, entry: {
  type: LedgerType; amount: number; bucket?: 'free' | 'paid'; reason: string; key?: string; meta?: Record<string, unknown>;
}): Promise<boolean> {
  const bucket = entry.bucket ?? 'free';
  if (!(entry.amount > 0)) return false;
  let ledger;
  try {
    ledger = await CoinLedger.create({
      uid,
      type: entry.type,
      amount: entry.amount,
      free: bucket === 'free' ? entry.amount : 0,
      paid: bucket === 'paid' ? entry.amount : 0,
      reason: entry.reason,
      key: entry.key,
      meta: entry.meta,
    });
  } catch (err) {
    if (isDuplicateKey(err)) return false;
    throw err;
  }
  const updated = await User.findByIdAndUpdate(uid, { $inc: { [`coins.${bucket}`]: entry.amount } }, { new: true }).select('coins').lean();
  await CoinLedger.updateOne({ _id: ledger._id }, { $set: { balanceAfter: { free: updated?.coins?.free ?? 0, paid: updated?.coins?.paid ?? 0 } } });
  return true;
}

/**
 * Debits up to `amount` coins (free first). With `allowPartial` it takes whatever is there
 * (used when reversing a referral reward the referrer already spent); otherwise it fails
 * without changing anything if the balance is too low.
 */
async function debit(uid: string, amount: number, entry: {
  type: LedgerType; reason: string; key?: string; meta?: Record<string, unknown>; allowPartial?: boolean;
}): Promise<{ ok: boolean; ledgerId?: string; free: number; paid: number; balance: { free: number; paid: number } }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const balance = await balanceOf(uid);
    const total = balance.free + balance.paid;
    if (total < amount && !entry.allowPartial) return { ok: false, free: 0, paid: 0, balance };
    const take = Math.min(amount, total);
    const takeFree = Math.min(balance.free, take);
    const takePaid = take - takeFree;
    // Optimistic concurrency: only applies if nobody changed the balance since it was read.
    const updated = await User.findOneAndUpdate(
      { _id: uid, 'coins.free': balance.free, 'coins.paid': balance.paid },
      { $inc: { 'coins.free': -takeFree, 'coins.paid': -takePaid } },
      { new: true },
    ).select('coins').lean();
    if (!updated) continue;
    const after = { free: updated.coins?.free ?? 0, paid: updated.coins?.paid ?? 0 };
    let ledgerId: string | undefined;
    if (take > 0) {
      const ledger = await CoinLedger.create({
        uid, type: entry.type, amount: -take, free: -takeFree, paid: -takePaid,
        reason: entry.reason, key: entry.key, meta: entry.meta, balanceAfter: after,
      });
      ledgerId = ledger._id.toString();
    }
    return { ok: true, ledgerId, free: takeFree, paid: takePaid, balance: after };
  }
  throw new Error('Your coin balance is changing too quickly — please try again.');
}

/** Charges for an AI listing. Returns ok:false when the balance is too low. */
export async function spendCoins(uid: string, cost: number, reason: string, meta?: Record<string, unknown>) {
  const result = await debit(uid, cost, { type: 'spend', reason, meta });
  if (result.ok) await afterBalanceDrop(uid, result.balance);
  return result;
}

/** Gives back a charge whose AI call failed — same free/paid split as the original charge. */
export async function refundSpend(uid: string, charge: { ledgerId?: string; free: number; paid: number }, reason: string): Promise<void> {
  if (!charge.ledgerId) return;
  const key = `refund:${charge.ledgerId}`;
  if (charge.free > 0) await credit(uid, { type: 'refund', amount: charge.free, bucket: 'free', reason, key: `${key}:free`, meta: { spendLedgerId: charge.ledgerId } });
  if (charge.paid > 0) await credit(uid, { type: 'refund', amount: charge.paid, bucket: 'paid', reason, key: `${key}:paid`, meta: { spendLedgerId: charge.ledgerId } });
}

/** Records "used all free coins" and starts the starter-pack offer when the balance reaches 0. */
async function afterBalanceDrop(uid: string, balance: { free: number; paid: number }): Promise<void> {
  const now = new Date();
  if (balance.free <= 0) {
    await User.updateOne({ _id: uid, freeExhaustedAt: { $exists: false } }, { $set: { freeExhaustedAt: now } });
  }
  if (balance.free + balance.paid <= 0) await maybeStartStarterOffer(uid);
}

/** The ₹49 starter offer: only for sellers who never bought, only while packs are on, 48h from first hitting 0. */
async function maybeStartStarterOffer(uid: string): Promise<void> {
  if (!coinConfig.packs.enabled) return;
  const now = new Date();
  await User.updateOne(
    { _id: uid, hasPurchased: { $ne: true }, offerStartedAt: { $exists: false } },
    { $set: { offerStartedAt: now, offerExpiresAt: new Date(now.getTime() + coinConfig.packs.starter.offerHours * 3600 * 1000) } },
  );
}

export async function grantBonus(uid: string, bonus: BonusId): Promise<boolean> {
  return credit(uid, {
    type: 'earned_bonus',
    amount: coinConfig.earnedBonuses[bonus],
    reason: BONUS_REASONS[bonus],
    key: BONUS_KEYS[bonus],
  });
}

/** Bonus grant from routes whose main job is something else — never fails (or throws into) the request. */
export async function grantBonusSafely(uid: string, bonus: BonusId): Promise<void> {
  await ensureWallet(uid).then(() => grantBonus(uid, bonus)).catch((err) => console.error(`[wallet] ${bonus} bonus failed`, err));
}

function newReferralCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(7);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/**
 * Brings a (verified) account's wallet up to date. Safe to call on every wallet read:
 * - first time: coins initialised, referral code created;
 * - welcome bonus once (existing accounts keep whatever welcome they already got);
 * - mobile bonus if a number is on the profile;
 * - monthly free top-up (free balance raised to the configured amount on the 1st, never above it);
 * - starter offer if the balance is 0.
 */
export async function ensureWallet(uid: string): Promise<void> {
  let user = await User.findById(uid).lean();
  if (!user || !user.emailVerified) return;

  if (!user.walletInitAt) {
    await User.updateOne(
      { _id: uid, walletInitAt: { $exists: false } },
      { $set: { walletInitAt: new Date(), 'coins.free': user.coins?.free ?? 0, 'coins.paid': user.coins?.paid ?? 0 } },
    );
  }

  if (!user.referralCode) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await User.updateOne({ _id: uid, referralCode: { $exists: false } }, { $set: { referralCode: newReferralCode() } });
        break;
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
      }
    }
  }

  await credit(uid, { type: 'welcome_bonus', amount: coinConfig.welcomeBonus, reason: 'Welcome bonus', key: 'welcome' });

  if (user.phoneNumber && coinConfig.mobileBonusOnSignup) await grantBonus(uid, 'mobile');

  const month = monthKey();
  if (user.lastTopupMonth !== month) {
    // Claim this month's top-up atomically so two parallel requests can't both apply it.
    const claimed = await User.findOneAndUpdate(
      { _id: uid, lastTopupMonth: { $ne: month } },
      { $set: { lastTopupMonth: month } },
      { new: false },
    ).lean();
    // An account created this month got the welcome bonus instead; the top-up starts next month.
    if (claimed && claimed.lastTopupMonth) {
      const target = coinConfig.monthlyFreeTopUpTo;
      const before = await balanceOf(uid);
      if (before.free < target) {
        await credit(uid, {
          type: 'monthly_topup',
          amount: target - before.free,
          reason: `Topped up to ${target} free coins on ${new Intl.DateTimeFormat('en-IN', { timeZone: coinConfig.timezone, day: 'numeric', month: 'short' }).format(new Date())}`,
          key: `topup:${month}`,
        });
      }
    }
  }

  user = await User.findById(uid).select('coins').lean();
  const free = user?.coins?.free ?? 0;
  const paid = user?.coins?.paid ?? 0;
  if (free + paid <= 0) await maybeStartStarterOffer(uid);
}

// ---- Referrals ----

function overlap(a: Array<string | undefined | null>, b: Array<string | undefined | null>): boolean {
  const set = new Set(a.filter(Boolean));
  return b.some((value) => value && set.has(value));
}

function normalizePhone(phone?: string): string {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

/** Why a referral must not be rewarded (same phone, device or network as the referrer), or null. */
export function referralBlockReason(referred: any, referrer: any): string | null {
  const referredPhone = normalizePhone(referred.phoneNumber);
  if (referredPhone && referredPhone === normalizePhone(referrer.phoneNumber)) return 'same_phone';
  if (overlap([referred.signupDeviceId, ...(referred.deviceIds ?? [])], [referrer.signupDeviceId, ...(referrer.deviceIds ?? [])])) return 'same_device';
  if (overlap([referred.signupIpHash, ...(referred.ipHashes ?? [])], [referrer.signupIpHash, ...(referrer.ipHashes ?? [])])) return 'same_ip';
  return null;
}

/**
 * Called after a referred seller's first successful AI listing (they are verified by then, since
 * sign-in requires it). Both get the reward once; the referrer's side is capped per month.
 */
export async function processReferralAfterListing(uid: string): Promise<void> {
  const referred = await User.findById(uid).lean();
  if (!referred?.referral?.referrerUid || referred.referral.status !== 'pending' || !referred.emailVerified) return;
  const referrer = await User.findById(referred.referral.referrerUid).lean();
  if (!referrer) {
    await User.updateOne({ _id: uid }, { $set: { 'referral.status': 'blocked', 'referral.reason': 'referrer_deleted' } });
    return;
  }

  const blockReason = referralBlockReason(referred, referrer);
  if (blockReason) {
    await User.updateOne({ _id: uid, 'referral.status': 'pending' }, { $set: { 'referral.status': 'blocked', 'referral.reason': blockReason } });
    return;
  }

  // Claim the reward so a second listing (or a parallel request) can't pay it twice.
  const claimed = await User.findOneAndUpdate(
    { _id: uid, 'referral.status': 'pending' },
    { $set: { 'referral.status': 'rewarded', 'referral.rewardedAt': new Date() } },
  );
  if (!claimed) return;

  const reward = coinConfig.referral.reward;
  await ensureWallet(uid);
  await credit(uid, { type: 'referral', amount: reward, reason: 'You joined with a referral link', key: 'referral:referred', meta: { referrerUid: referrer._id.toString() } });

  const referrerUid = referrer._id.toString();
  const rewardedThisMonth = await CoinLedger.countDocuments({
    uid: referrerUid, type: 'referral', key: { $regex: '^referral:referrer:' }, createdAt: { $gte: monthStart() },
  });
  let referrerRewarded = false;
  if (rewardedThisMonth < coinConfig.referral.maxRewardsPerReferrerPerMonth) {
    await ensureWallet(referrerUid);
    referrerRewarded = await credit(referrerUid, {
      type: 'referral', amount: reward, reason: 'A seller you referred created their first listing',
      key: `referral:referrer:${uid}`, meta: { referredUid: uid },
    });
  }
  await User.updateOne({ _id: uid }, {
    $set: { 'referral.referrerRewarded': referrerRewarded, ...(referrerRewarded ? {} : { 'referral.reason': 'referrer_monthly_limit' }) },
  });
}

/** When a referred account is deleted soon after the reward, the referrer's coins are taken back. */
export async function reverseReferralOnDelete(referred: any): Promise<void> {
  const ref = referred?.referral;
  if (!ref || ref.status !== 'rewarded' || !ref.referrerRewarded || !ref.rewardedAt || !ref.referrerUid) return;
  const windowMs = coinConfig.referral.reverseIfDeletedWithinDays * 24 * 3600 * 1000;
  if (Date.now() - new Date(ref.rewardedAt).getTime() > windowMs) return;
  const referredUid = referred._id.toString();
  const existing = await CoinLedger.exists({ uid: ref.referrerUid, key: `referral:reversal:${referredUid}` });
  if (existing) return;
  await debit(ref.referrerUid, coinConfig.referral.reward, {
    type: 'referral_reversal',
    reason: `Referral reward reversed — the referred account was deleted within ${coinConfig.referral.reverseIfDeletedWithinDays} days`,
    key: `referral:reversal:${referredUid}`,
    meta: { referredUid },
    allowPartial: true,
  });
}

// ---- Free AI assists (per listing / per marketplace / per day limits) ----

async function tryIncrement(uid: string, scope: string, limit: number): Promise<boolean> {
  try {
    const doc = await AssistCounter.findOneAndUpdate(
      { uid, scope, count: { $lt: limit } },
      { $inc: { count: 1 } },
      { upsert: true, new: true },
    );
    return !!doc;
  } catch (err) {
    // No row under the limit matched and the upsert collided with the existing (full) row.
    if (isDuplicateKey(err)) return false;
    throw err;
  }
}

async function decrement(uid: string, scope: string): Promise<void> {
  await AssistCounter.updateOne({ uid, scope, count: { $gt: 0 } }, { $inc: { count: -1 } });
}

export type AssistKind = 'field_fix' | 'marketplace_autofill';

export function assistScopes(kind: AssistKind, listingKey: string, marketplace?: string): { item: string; itemLimit: number; day: string; dayLimit: number } {
  const limits = coinConfig.freeAssists;
  return kind === 'field_fix'
    ? { item: `field_fix:${listingKey}`, itemLimit: limits.fieldFixPerListing, day: `day:${dayKey()}`, dayLimit: limits.perUserPerDay }
    : { item: `autofill:${marketplace}:${listingKey}`, itemLimit: limits.autofillPerListingPerMarketplace, day: `day:${dayKey()}`, dayLimit: limits.perUserPerDay };
}

/** Reserves one free assist; returns which limit was hit, or null when reserved. */
export async function reserveAssist(uid: string, kind: AssistKind, listingKey: string, marketplace?: string): Promise<'item' | 'day' | null> {
  const scopes = assistScopes(kind, listingKey, marketplace);
  if (!(await tryIncrement(uid, scopes.item, scopes.itemLimit))) return 'item';
  if (!(await tryIncrement(uid, scopes.day, scopes.dayLimit))) {
    await decrement(uid, scopes.item);
    return 'day';
  }
  return null;
}

/** Failed calls don't count against the limits. */
export async function releaseAssist(uid: string, kind: AssistKind, listingKey: string, marketplace?: string): Promise<void> {
  const scopes = assistScopes(kind, listingKey, marketplace);
  await decrement(uid, scopes.item);
  await decrement(uid, scopes.day);
}

export async function assistsLeft(uid: string, kind: AssistKind, listingKey: string, marketplace?: string): Promise<{ left: number; limit: number; dayLeft: number; dayLimit: number }> {
  const scopes = assistScopes(kind, listingKey, marketplace);
  const [item, day] = await Promise.all([
    AssistCounter.findOne({ uid, scope: scopes.item }).lean(),
    AssistCounter.findOne({ uid, scope: scopes.day }).lean(),
  ]);
  const dayLeft = Math.max(0, scopes.dayLimit - (day?.count ?? 0));
  return {
    left: Math.min(Math.max(0, scopes.itemLimit - (item?.count ?? 0)), dayLeft),
    limit: scopes.itemLimit,
    dayLeft,
    dayLimit: scopes.dayLimit,
  };
}

// ---- "Time saved" ----

export async function timeSavedFor(uid: string, from: Date, to: Date) {
  const [aiListings, autofills, gstLookups] = await Promise.all([
    AiUsage.countDocuments({ uid, purpose: 'listing', success: true, createdAt: { $gte: from, $lt: to } }),
    AiUsage.countDocuments({ uid, purpose: 'marketplace_autofill', success: true, createdAt: { $gte: from, $lt: to } }),
    GstLookup.countDocuments({ uid, createdAt: { $gte: from, $lt: to } }),
  ]);
  const m = coinConfig.timeSavedMinutes;
  const minutes = aiListings * m.aiListing + autofills * m.marketplaceAutofill + gstLookups * m.gstLookup;
  return { hours: Math.round((minutes / 60) * 2) / 2, minutes, counts: { aiListings, autofills, gstLookups } };
}

// ---- Wallet summary for the frontend ----

export async function walletSummary(uid: string) {
  await ensureWallet(uid);
  const user = await User.findById(uid).lean();
  if (!user) throw new Error('User not found');
  const now = new Date();
  const free = user.coins?.free ?? 0;
  const paid = user.coins?.paid ?? 0;

  const ledgerKeys = new Set(
    (await CoinLedger.find({ uid, key: { $in: ['welcome', ...Object.values(BONUS_KEYS), 'purchase:starter'] } }).select('key').lean())
      .map((row: any) => row.key),
  );

  const referralRewardedThisMonth = await CoinLedger.countDocuments({
    uid, type: 'referral', key: { $regex: '^referral:referrer:' }, createdAt: { $gte: monthStart(now) },
  });
  const referralRewardedTotal = await CoinLedger.countDocuments({ uid, type: 'referral', key: { $regex: '^referral:referrer:' } });

  const packsEnabled = coinConfig.packs.enabled;
  const starterBought = ledgerKeys.has('purchase:starter');
  const starterAvailable = packsEnabled && !user.hasPurchased && !starterBought
    && !!user.offerExpiresAt && new Date(user.offerExpiresAt).getTime() > now.getTime();
  const starter = coinConfig.packs.starter;
  const regular = packsEnabled ? coinConfig.packs.regular : [];
  const festive = packsEnabled ? activeFestivePacks(now) : [];
  const prices = [...regular, ...festive].map((p) => p.priceInr);
  if (starterAvailable) prices.push(starter.priceInr);

  const lastMonthStart = monthStart(new Date(monthStart(now).getTime() - 24 * 3600 * 1000));
  const [thisMonth, lastMonth, notifyClick, recentLedger, fieldFixDay] = await Promise.all([
    timeSavedFor(uid, monthStart(now), nextTopUpDate(now)),
    timeSavedFor(uid, lastMonthStart, monthStart(now)),
    PackInterest.exists({ uid }),
    CoinLedger.find({ uid }).sort({ createdAt: -1 }).limit(20).lean(),
    AssistCounter.findOne({ uid, scope: `day:${dayKey(now)}` }).lean(),
  ]);

  const referralBase = coinConfig.referral.baseUrl.replace(/\/?$/, '/');

  return {
    balance: { free, paid, total: free + paid },
    listingCost: coinConfig.listingCost,
    monthlyTopUpTo: coinConfig.monthlyFreeTopUpTo,
    nextTopUpAt: nextTopUpDate(now).toISOString(),
    bonuses: [
      { id: 'welcome', coins: coinConfig.welcomeBonus, done: ledgerKeys.has('welcome') },
      { id: 'mobile', coins: coinConfig.earnedBonuses.mobile, done: ledgerKeys.has(BONUS_KEYS.mobile) },
      { id: 'firstInventorySave', coins: coinConfig.earnedBonuses.firstInventorySave, done: ledgerKeys.has(BONUS_KEYS.firstInventorySave) },
      { id: 'firstPublish', coins: coinConfig.earnedBonuses.firstPublish, done: ledgerKeys.has(BONUS_KEYS.firstPublish) },
    ],
    referral: {
      code: user.referralCode ?? null,
      link: user.referralCode ? `${referralBase}?ref=${user.referralCode}` : null,
      reward: coinConfig.referral.reward,
      maxPerMonth: coinConfig.referral.maxRewardsPerReferrerPerMonth,
      rewardedThisMonth: referralRewardedThisMonth,
      rewardedTotal: referralRewardedTotal,
    },
    packs: {
      enabled: packsEnabled,
      lowBalanceThreshold: coinConfig.packs.lowBalanceThreshold,
      starter: starterAvailable ? { ...starter, expiresAt: new Date(user.offerExpiresAt).toISOString() } : null,
      regular,
      festive,
      minPriceInr: prices.length ? Math.min(...prices) : null,
      hasPurchased: !!user.hasPurchased,
    },
    notifyRequested: !!notifyClick,
    timeSaved: { month: monthKey(now), ...thisMonth },
    lastMonthTimeSaved: { month: monthKey(lastMonthStart), ...lastMonth },
    catalog: { band: user.catalogSizeBand ?? null, promptDismissed: !!user.catalogPromptDismissedAt, bands: coinConfig.catalogSizeBands },
    freeAssists: {
      ...coinConfig.freeAssists,
      usedToday: fieldFixDay?.count ?? 0,
    },
    /** Fields the AI never fills (the server enforces this too) — the UI hides AI buttons on them. */
    blockedFieldPatterns: coinConfig.autofillBlockedFieldPatterns,
    ledger: recentLedger.map((row: any) => ({
      id: row._id.toString(),
      type: row.type,
      amount: row.amount,
      reason: row.reason,
      createdAt: row.createdAt,
      balanceAfter: row.balanceAfter ? (row.balanceAfter.free ?? 0) + (row.balanceAfter.paid ?? 0) : null,
    })),
  };
}
