import { Routes } from '@angular/router';
import { OptimizeSessionService } from './optimize-session.service';

export const OPTIMIZE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./optimize-layout').then((m) => m.OptimizeLayout),
    providers: [OptimizeSessionService],
    children: [
      { path: '', redirectTo: 'general', pathMatch: 'full' },
      { path: 'general', title: 'General Details - SellAssist', loadComponent: () => import('./optimize-general-details').then((m) => m.OptimizeGeneralDetails) },
      { path: 'my-listings', title: 'My Listings - SellAssist', loadComponent: () => import('./my-listings').then((m) => m.MyListings) },
      { path: 'batch', title: 'Add many products - SellAssist', loadComponent: () => import('./batch/batch-page').then((m) => m.BatchPage) },
      { path: 'bulk-upload', title: 'Bulk upload file - SellAssist', loadComponent: () => import('./bulk/bulk-upload').then((m) => m.BulkUpload) },
      { path: 'profile', title: 'Profile - SellAssist', loadComponent: () => import('./profile/profile-page').then((m) => m.ProfilePage) },
      { path: 'wallet', title: 'Coins - SellAssist', loadComponent: () => import('./wallet/wallet-page').then((m) => m.WalletPage) },
      { path: 'inventory', title: 'Inventory - SellAssist', loadComponent: () => import('./inventory/optimize-inventory').then((m) => m.OptimizeInventory) },
      { path: 'amazon', title: 'Amazon listing - SellAssist', loadComponent: () => import('./optimize-amazon-listing').then((m) => m.OptimizeAmazonListing) },
      { path: 'flipkart', title: 'Flipkart listing - SellAssist', loadComponent: () => import('./optimize-flipkart-listing').then((m) => m.OptimizeFlipkartListing) },
      { path: 'meesho', title: 'Meesho listing - SellAssist', loadComponent: () => import('./optimize-meesho-listing').then((m) => m.OptimizeMeeshoListing) },
      { path: 'instagram', title: 'Instagram content - SellAssist', loadComponent: () => import('./optimize-instagram-content').then((m) => m.OptimizeInstagramContent) },
      { path: 'insights', title: 'AI Insights - SellAssist', loadComponent: () => import('./optimize-ai-insights').then((m) => m.OptimizeAiInsights) },
      { path: 'readiness', title: 'Marketplace Readiness - SellAssist', loadComponent: () => import('./optimize-marketplace-readiness').then((m) => m.OptimizeMarketplaceReadiness) },
      { path: 'publish', title: 'Publish Center - SellAssist', loadComponent: () => import('./optimize-publish-center').then((m) => m.OptimizePublishCenter) },
      { path: 'export', title: 'Export Center - SellAssist', loadComponent: () => import('./optimize-export-center').then((m) => m.OptimizeExportCenter) },
    ],
  },
];

/**
 * Starts downloading the workspace shell and one page's code straight away (e.g. on a hard refresh
 * of /optimize/inventory), in parallel with the session check, instead of after authGuard. The
 * router's own loadComponent call later reuses the same module.
 */
export function prefetchOptimizeRoute(child: string): void {
  const shell = OPTIMIZE_ROUTES[0];
  const page = shell.children?.find((route) => route.path === (child || 'general'));
  for (const load of [shell.loadComponent, page?.loadComponent]) {
    if (load) void Promise.resolve(load()).catch(() => undefined);
  }
}
