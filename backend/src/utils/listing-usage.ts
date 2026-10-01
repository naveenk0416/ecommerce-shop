import { User } from '../api/common.js';
import { recordUserFunnelEvent } from './funnel.js';
import { processReferralAfterListing } from './wallet.js';

/**
 * Everything that follows a successful AI listing, single or batch: usage counters, the
 * "first listing" activation event and a pending referral reward.
 */
export async function recordListingSuccess(uid: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const user = await User.findById(uid).select('dailyStats').lean();
  await User.updateOne({ _id: uid }, user?.dailyStats?.date === today
    ? { $inc: { usageCount: 1, 'dailyStats.count': 1 } }
    : { $inc: { usageCount: 1 }, $set: { dailyStats: { date: today, count: 1 } } });
  // Activation: the seller's first AI listing.
  const firstTime = await User.findOneAndUpdate({ _id: uid, firstListingAt: { $exists: false } }, { $set: { firstListingAt: new Date() } });
  if (firstTime) await recordUserFunnelEvent('first_listing_created', firstTime);

  await processReferralAfterListing(uid).catch((err) => console.error('[referral] reward failed', err));
}
