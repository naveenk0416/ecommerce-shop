import { ChangeDetectionStrategy, Component, signal, inject, output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { people, cube, refresh, eye, trash, mailOutline } from 'ionicons/icons';
import { AdminService, UserProfile } from './services/admin';
import { Listing } from './services/listing';
import { parsePrice } from './utils/price';

@Component({
  selector: 'app-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, IonIcon, IonSpinner
  ],
  template: `
    <div class="admin-panel p-10 space-y-12 pb-20">
      <header class="flex items-center justify-between mb-2">
        <h2 class="text-3xl font-black text-slate-900 tracking-tight font-display italic uppercase">Admin Control Center</h2>
        <div class="flex gap-2">
          <button (click)="loadData()" [disabled]="loading()" class="btn-secondary h-10 px-4">
            <ion-icon name="refresh" class="mr-2"></ion-icon>
            Reload
          </button>
        </div>
      </header>

      @if (loading()) {
        <div class="flex justify-center py-20">
          <ion-spinner name="crescent" color="primary"></ion-spinner>
        </div>
      } @else {
        <!-- Stats Row -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-orange-600 p-8 rounded-[2.5rem] border-none shadow-xl shadow-orange-600/20 text-white relative overflow-hidden group">
            <div class="relative z-10">
              <h3 class="text-[10px] font-black uppercase tracking-[0.25em] text-orange-200 mb-1">Total Users</h3>
              <p class="text-5xl font-black font-display italic">{{ users().length }}</p>
            </div>
            <ion-icon name="people" class="absolute -right-6 -bottom-6 text-8xl text-white/10 rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:rotate-0"></ion-icon>
          </div>
          <div class="bg-slate-950 p-8 rounded-[2.5rem] border-none shadow-xl shadow-slate-950/20 text-white relative overflow-hidden group">
            <div class="relative z-10">
              <h3 class="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-1">Total Listings</h3>
              <p class="text-5xl font-black font-display italic">{{ listings().length }}</p>
            </div>
            <ion-icon name="cube" class="absolute -right-6 -bottom-6 text-8xl text-white/5 rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:rotate-0"></ion-icon>
          </div>
        </div>

        <!-- Users Table -->
        <section class="space-y-4 pt-4">
          <div class="flex items-center justify-between px-2">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Registered Users</h3>
            <span class="text-[9px] font-bold text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">{{ users().length }} accounts</span>
          </div>

          <div class="bg-white border border-slate-100 rounded-[2.5rem] shadow-xl shadow-slate-200/40 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr class="bg-slate-950">
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">User</th>
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">Plan</th>
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300 text-center">Total Usage</th>
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300 text-right">Last Login</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (user of users(); track user.uid) {
                    <tr class="group even:bg-slate-50/50 hover:bg-orange-50/60 transition-colors duration-200">
                      <td class="py-3 px-3">
                        <div class="flex items-center gap-4">
                          <div class="w-11 h-11 rounded-2xl overflow-hidden border border-slate-100 flex-shrink-0">
                            <img [src]="user.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.uid"
                                 [alt]="user.displayName || 'User avatar'"
                                 referrerpolicy="no-referrer"
                                 class="w-full h-full object-cover">
                          </div>
                          <div class="min-w-0">
                            <h4 class="text-sm font-bold text-slate-900 tracking-tight truncate">{{ user.displayName || 'Anonymous User' }}</h4>
                            <p class="text-[11px] text-slate-400 font-medium truncate flex items-center gap-1.5 mt-0.5">
                              <ion-icon name="mail-outline" class="text-[10px] text-orange-500"></ion-icon>
                              {{ user.email }}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td class="py-3 px-3">
                        <span class="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg"
                              [class.bg-slate-950]="user.role === 'ADMIN'"
                              [class.text-white]="user.role === 'ADMIN'"
                              [class.bg-orange-100]="user.role === 'PAID_PRO'"
                              [class.text-orange-600]="user.role === 'PAID_PRO'"
                              [class.bg-slate-100]="user.role !== 'ADMIN' && user.role !== 'PAID_PRO'"
                              [class.text-slate-500]="user.role !== 'ADMIN' && user.role !== 'PAID_PRO'">
                          {{ user.role === 'PAID_PRO' ? 'PRO' : user.role }}
                        </span>
                      </td>
                      <td class="py-3 px-3 text-center">
                        <span class="text-sm font-bold text-slate-700 tabular-nums">{{ user.usageCount || 0 }}</span>
                      </td>
                      <td class="py-3 px-3 text-right">
                        <p class="text-sm font-bold text-slate-900 leading-none tabular-nums">{{ user.lastLogin | date:'shortTime' }}</p>
                        <p class="text-[9px] font-bold text-slate-400 mt-1.5 uppercase tracking-widest">{{ user.lastLogin | date:'dd MMM yyyy' }}</p>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="4" class="py-16 text-center text-sm font-medium text-slate-400">No users registered yet.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- Listings Table -->
        <section class="space-y-4 pt-4">
          <div class="flex items-center justify-between px-2">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">All Saved Listings</h3>
            <span class="text-[9px] font-bold text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">{{ listings().length }} items</span>
          </div>

          <div class="bg-white border border-slate-100 rounded-[2.5rem] shadow-xl shadow-slate-200/40 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse min-w-[640px]">
                <thead>
                  <tr class="bg-slate-950">
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">Product</th>
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">Owner</th>
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">Saved On</th>
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300 text-right">Price</th>
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (listing of listings(); track listing.id) {
                    <tr class="group even:bg-slate-50/50 hover:bg-orange-50/60 transition-colors duration-200">
                      <td class="py-3 px-3">
                        <div class="flex items-center gap-4">
                          <div class="w-12 h-12 rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 flex-shrink-0">
                            <img [src]="listing.processedImage || listing.originalImage || 'assets/logo_icon.png'"
                                 [alt]="listing.name"
                                 referrerpolicy="no-referrer"
                                 class="w-full h-full object-cover">
                          </div>
                          <div class="max-w-[260px]">
                            <h4 class="text-sm font-bold text-slate-900 tracking-tight leading-tight line-clamp-2">{{ listing.name }}</h4>
                          </div>
                        </div>
                      </td>
                      <td class="py-3 px-3">
                        <span class="text-[10px] font-mono font-bold text-slate-500 px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-100">
                          {{ listing.uid.substring(0, 12) }}…
                        </span>
                      </td>
                      <td class="py-3 px-3">
                        <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{{ listing.createdAt | date:'dd MMM yyyy' }}</span>
                      </td>
                      <td class="py-3 px-3 text-right">
                        <span class="text-sm font-black text-slate-900 font-display tabular-nums">₹{{ price(listing.priceINR) | number }}</span>
                      </td>
                      <td class="py-3 px-3 text-right">
                        <div class="flex justify-end gap-2">
                          <button (click)="viewListing(listing)" class="btn-icon-dark w-9 h-9" aria-label="View listing">
                            <ion-icon name="eye"></ion-icon>
                          </button>
                          <button (click)="deleteListing(listing.id!)" class="btn-icon-premium w-9 h-9 text-red-500 hover:text-red-600" aria-label="Delete listing">
                            <ion-icon name="trash"></ion-icon>
                          </button>
                        </div>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="5" class="py-16 text-center text-sm font-medium text-slate-400">No listings saved yet.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </section>
      }
    </div>
  `
})
export class AdminComponent implements OnInit {
  private adminService = inject(AdminService);

  view = output<Listing>();

  users = signal<UserProfile[]>([]);
  listings = signal<Listing[]>([]);
  loading = signal(false);

  constructor() {
    addIcons({ people, cube, refresh, eye, trash, mailOutline });
  }

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.loading.set(true);
    try {
      const [u, l] = await Promise.all([
        this.adminService.getAllUsers(),
        this.adminService.getAllListings()
      ]);
      this.users.set(u);
      this.listings.set(l);
    } catch (e) {
      console.error('Admin data load failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  async deleteListing(id: string) {
    if (confirm('Are you sure you want to delete this listing globally?')) {
      await this.adminService.deleteUserListing(id);
      this.loadData();
    }
  }

  viewListing(listing: Listing) {
    this.view.emit(listing);
  }

  /** Template-friendly price parser — turns "₹1,299" / 1299 into a plain number. */
  price(value: string | number | undefined | null): number {
    return parsePrice(value);
  }
}
