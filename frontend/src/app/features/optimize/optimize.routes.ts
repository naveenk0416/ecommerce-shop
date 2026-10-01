import { Routes } from '@angular/router';
import { OptimizeSessionService } from './optimize-session.service';

export const OPTIMIZE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./optimize-layout').then((m) => m.OptimizeLayout),
    providers: [OptimizeSessionService],
    children: [
      { path: '', redirectTo: 'general', pathMatch: 'full' },
      { path: 'general', loadComponent: () => import('./optimize-general-details').then((m) => m.OptimizeGeneralDetails) },
      { path: 'my-listings', title: 'My Listings - SellAssist', loadComponent: () => import('./my-listings').then((m) => m.MyListings) },
      { path: 'batch', title: 'Add many products - SellAssist', loadComponent: () => import('./batch/batch-page').then((m) => m.BatchPage) },
      { path: 'bulk-upload', title: 'Bulk upload file - SellAssist', loadComponent: () => import('./bulk/bulk-upload').then((m) => m.BulkUpload) },
      { path: 'profile', title: 'Profile - SellAssist', loadComponent: () => import('./profile/profile-page').then((m) => m.ProfilePage) },
      { path: 'wallet', title: 'Coins - SellAssist', loadComponent: () => import('./wallet/wallet-page').then((m) => m.WalletPage) },
      { path: 'inventory', loadComponent: () => import('./inventory/optimize-inventory').then((m) => m.OptimizeInventory) },
      { path: 'amazon', loadComponent: () => import('./optimize-amazon-listing').then((m) => m.OptimizeAmazonListing) },
      { path: 'flipkart', loadComponent: () => import('./optimize-flipkart-listing').then((m) => m.OptimizeFlipkartListing) },
      { path: 'meesho', loadComponent: () => import('./optimize-meesho-listing').then((m) => m.OptimizeMeeshoListing) },
      { path: 'instagram', loadComponent: () => import('./optimize-instagram-content').then((m) => m.OptimizeInstagramContent) },
      { path: 'insights', loadComponent: () => import('./optimize-ai-insights').then((m) => m.OptimizeAiInsights) },
      { path: 'readiness', loadComponent: () => import('./optimize-marketplace-readiness').then((m) => m.OptimizeMarketplaceReadiness) },
      { path: 'publish', loadComponent: () => import('./optimize-publish-center').then((m) => m.OptimizePublishCenter) },
      { path: 'export', loadComponent: () => import('./optimize-export-center').then((m) => m.OptimizeExportCenter) },
    ],
  },
];
