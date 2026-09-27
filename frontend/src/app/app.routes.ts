import {Routes} from '@angular/router';
import { Landing } from './landing';
import { GstCalculator } from './gst-calculator';
import { Products } from './products';
import { AdminComponent } from './admin';
import { authGuard } from './guards/auth.guard';
import { NotFound, RouteStub } from './pages/not-found';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: Landing },
  { path: 'optimize', canActivate: [authGuard], loadChildren: () => import('./features/optimize/optimize.routes').then(m => m.OPTIMIZE_ROUTES) },
  { path: 'listings', loadComponent: () => import('./app').then(m => m.App) },
  { path: 'inventory', component: Products },
  { path: 'gst-calculator', component: GstCalculator },
  { path: 'admin', component: AdminComponent },
  // Rendered via app.html's own mainView branching (see App component), same as 'admin' and
  // 'inventory' above — this route entry only exists so router.navigate(['/settings']) resolves
  // without a "cannot match route" warning.
  { path: 'settings', component: GstCalculator },
  { path: 'workspace/:listingId', canActivate: [authGuard], loadChildren: () => import('./features/listing-workspace/listing-workspace.routes').then(m => m.LISTING_WORKSPACE_ROUTES) },
  // Public content pages, rendered through the App shell's <router-outlet> (mainView 'page').
  { path: 'privacy', title: 'Privacy Policy - SellAssist', loadComponent: () => import('./pages/privacy-policy').then(m => m.PrivacyPolicy) },
  { path: 'terms', title: 'Terms of Service - SellAssist', loadComponent: () => import('./pages/terms').then(m => m.Terms) },
  { path: 'refund-policy', title: 'Cancellation & Refund Policy - SellAssist', loadComponent: () => import('./pages/refund-policy').then(m => m.RefundPolicy) },
  { path: 'contact', title: 'Contact - SellAssist', loadComponent: () => import('./pages/contact').then(m => m.Contact) },
  // Email-link landing paths handled by the App shell from window.location.
  { path: 'reset-password', component: RouteStub },
  { path: 'forgot-password', component: RouteStub },
  { path: 'verify-email', component: RouteStub },
  // Must stay last: any unknown public URL shows a 404 instead of the login screen.
  { path: '**', title: 'Page not found - SellAssist', component: NotFound },
];
