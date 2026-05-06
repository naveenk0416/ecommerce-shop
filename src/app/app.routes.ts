import {Routes} from '@angular/router';
import { Landing } from './landing';
import { GstCalculator } from './gst-calculator';
import { Products } from './products';
import { AdminComponent } from './admin';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: Landing },
  { path: 'optimize', loadComponent: () => import('./app').then(m => m.App) }, // This might be tricky if App is root
  { path: 'listings', loadComponent: () => import('./app').then(m => m.App) },
  { path: 'inventory', component: Products },
  { path: 'gst-calculator', component: GstCalculator },
  { path: 'admin', component: AdminComponent },
];
