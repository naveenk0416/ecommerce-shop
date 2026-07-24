import { Routes } from '@angular/router';
import { ListingWorkspace } from './listing-workspace';

export const LISTING_WORKSPACE_ROUTES: Routes = [
  {
    path: '',
    component: ListingWorkspace,
    children: [
      { path: '', redirectTo: 'general', pathMatch: 'full' },
      { path: 'general', loadComponent: () => import('./tabs/general-details/general-details').then(m => m.GeneralDetails) },
      { path: 'amazon', loadComponent: () => import('./tabs/amazon-listing/amazon-listing').then(m => m.AmazonListing) },
      { path: 'flipkart', loadComponent: () => import('./tabs/flipkart-listing/flipkart-listing').then(m => m.FlipkartListing) },
      { path: 'meesho', loadComponent: () => import('./tabs/meesho-listing/meesho-listing').then(m => m.MeeshoListing) },
      { path: 'instagram', loadComponent: () => import('./tabs/instagram-content/instagram-content').then(m => m.InstagramContentTab) },
      { path: 'insights', loadComponent: () => import('./tabs/ai-insights/ai-insights').then(m => m.AiInsightsTab) },
      { path: 'readiness', loadComponent: () => import('./tabs/marketplace-readiness/marketplace-readiness').then(m => m.MarketplaceReadinessTab) },
      { path: 'publish', loadComponent: () => import('./tabs/publish-center/publish-center').then(m => m.PublishCenter) },
      { path: 'export', loadComponent: () => import('./tabs/export-center/export-center').then(m => m.ExportCenter) },
    ],
  },
];
