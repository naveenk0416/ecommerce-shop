import {Routes} from '@angular/router';
import { Landing } from './landing';
import { GstCalculator } from './gst-calculator';
import { Products } from './products';
import { AdminComponent } from './admin';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: Landing },
  { path: 'optimize', loadComponent: () => import('./features/optimize/optimize-page').then(m => m.OptimizePage) },
  { path: 'listings', loadComponent: () => import('./app').then(m => m.App) },
  { path: 'inventory', component: Products },
  { path: 'gst-calculator', component: GstCalculator },
  { path: 'admin', component: AdminComponent },
  { path: 'workspace/:listingId', loadChildren: () => import('./features/listing-workspace/listing-workspace.routes').then(m => m.LISTING_WORKSPACE_ROUTES) },
];
