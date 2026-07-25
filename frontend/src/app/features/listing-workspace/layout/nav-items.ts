import { MarketplaceId } from '../ui/marketplace-icon/marketplace-icon';

export interface WorkspaceNavItem {
  path: string;
  label: string;
  marketplace: MarketplaceId;
}

export const WORKSPACE_NAV_ITEMS: readonly WorkspaceNavItem[] = [
  { path: 'general', label: 'General Details', marketplace: 'general' },
  { path: 'amazon', label: 'Amazon', marketplace: 'amazon' },
  { path: 'flipkart', label: 'Flipkart', marketplace: 'flipkart' },
  { path: 'meesho', label: 'Meesho', marketplace: 'meesho' },
  { path: 'instagram', label: 'Instagram', marketplace: 'instagram' },
  { path: 'insights', label: 'AI Insights', marketplace: 'insights' },
  { path: 'readiness', label: 'Marketplace Readiness', marketplace: 'readiness' },
  { path: 'publish', label: 'Publish Center', marketplace: 'publish' },
  { path: 'export', label: 'Export Center', marketplace: 'export' },
];
