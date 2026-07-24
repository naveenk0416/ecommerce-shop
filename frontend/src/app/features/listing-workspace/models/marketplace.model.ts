export type MarketplaceId =
  | 'amazon' | 'flipkart' | 'meesho' | 'instagram'
  | 'shopify' | 'woocommerce' | 'myntra' | 'ajio' | 'tiktokshop' | 'facebook';

export interface Marketplace {
  id: MarketplaceId;
  label: string;
  brandColor: string;
  icon: string;
  status: 'live' | 'comingSoon';
}

export const LIVE_MARKETPLACE_IDS: MarketplaceId[] = ['amazon', 'flipkart', 'meesho', 'instagram'];
