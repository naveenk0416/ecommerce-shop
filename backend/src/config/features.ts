import '../utils/env.js';

/**
 * Launch switches for publishing NEW listings to channels that aren't live yet. Going live is a
 * config change: set e.g. FLIPKART_PUBLISH_ENABLED=true in the backend env and restart — the app
 * reads these through GET /api/features. Unset means off.
 *
 * Not covered here (always on): Amazon publishing, "Sync from Flipkart", and pushing price/stock
 * back to listings that were synced from Flipkart.
 */
export type PublishChannel = 'flipkart' | 'meesho' | 'instagram';

export const PUBLISH_CHANNEL_LABELS: Record<PublishChannel, string> = {
  flipkart: 'Flipkart',
  meesho: 'Meesho',
  instagram: 'Instagram',
};

const FLAG_NAMES: Record<PublishChannel, string> = {
  flipkart: 'FLIPKART_PUBLISH_ENABLED',
  meesho: 'MEESHO_PUBLISH_ENABLED',
  instagram: 'INSTAGRAM_PUBLISH_ENABLED',
};

/** "Notify me" features a seller can sign up for. */
export const NOTIFY_FEATURES = ['flipkart_publish', 'meesho_publish', 'instagram_publish'] as const;
export type NotifyFeature = (typeof NOTIFY_FEATURES)[number];

/** Read on every call so a changed env takes effect on restart without code changes. */
export function publishEnabled(channel: PublishChannel): boolean {
  return /^(1|true|yes|on)$/i.test((process.env[FLAG_NAMES[channel]] ?? '').trim());
}

export function publishFlags(): Record<'amazon' | PublishChannel, boolean> {
  return {
    amazon: true,
    flipkart: publishEnabled('flipkart'),
    meesho: publishEnabled('meesho'),
    instagram: publishEnabled('instagram'),
  };
}
