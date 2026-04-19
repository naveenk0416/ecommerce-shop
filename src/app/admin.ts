import { ChangeDetectionStrategy, Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { AdminService, UserProfile } from './services/admin';
import { Listing } from './services/listing';

@Component({
  selector: 'app-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, IonButton, IonIcon, IonSpinner
  ],
  template: `
    <div class="admin-panel p-10 space-y-12 pb-20">
      <header class="flex items-center justify-between mb-2">
        <h2 class="text-3xl font-black text-slate-900 tracking-tight">Admin Control Center</h2>
        <div class="flex gap-2">
          <ion-button (click)="loadData()" fill="outline" size="small" [disabled]="loading()" class="h-10">
            <ion-icon slot="start" name="refresh"></ion-icon>
            Reload
          </ion-button>
        </div>
      </header>

      @if (loading()) {
        <div class="flex justify-center py-20">
          <ion-spinner name="crescent" color="primary"></ion-spinner>
        </div>
      } @else {
        <!-- Stats Row -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-orange-50 p-6 rounded-[2rem] border border-orange-100">
            <h3 class="text-[10px] font-black uppercase tracking-widest text-orange-600 mb-1">Total Users</h3>
            <p class="text-3xl font-black text-slate-900">{{ users().length }}</p>
          </div>
          <div class="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100">
            <h3 class="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Total Listings</h3>
            <p class="text-3xl font-black text-slate-900">{{ listings().length }}</p>
          </div>
        </div>

        <!-- Users List -->
        <section class="space-y-4">
          <div class="flex items-center justify-between px-2">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Recent Access Activity</h3>
            <span class="text-[9px] font-bold text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">Live Updates</span>
          </div>

          <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div class="divide-y divide-slate-50">
              @for (user of users(); track user.uid) {
                <div class="group flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors cursor-default">
                  <div class="relative flex-shrink-0">
                    <div class="w-12 h-12 rounded-2xl overflow-hidden shadow-sm border border-slate-100 ring-2 ring-white ring-offset-2 ring-offset-slate-50 group-hover:ring-orange-100 transition-all">
                      <img [src]="user.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.uid" 
                           [alt]="user.displayName" 
                           referrerpolicy="no-referrer"
                           class="w-full h-full object-cover">
                    </div>
                    @if (user.lastLogin) {
                      <div class="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></div>
                    }
                  </div>

                  <div class="flex-grow min-w-0">
                    <div class="flex items-center gap-2">
                      <h4 class="font-bold text-slate-800 tracking-tight truncate leading-tight">
                        {{ user.displayName || 'Anonymous User' }}
                      </h4>
                      @if (!user.displayName) {
                        <span class="px-1.5 py-0.5 rounded bg-slate-100 text-[8px] font-black text-slate-400 uppercase tracking-tighter">Guest</span>
                      }
                    </div>
                    <p class="text-[11px] text-slate-400 font-medium truncate flex items-center gap-1.5">
                      <ion-icon name="mail-outline" class="text-[10px]"></ion-icon>
                      {{ user.email }}
                    </p>
                  </div>

                  <div class="text-right flex-shrink-0">
                    <p class="text-[10px] font-black text-slate-900 leading-none">
                      {{ user.lastLogin | date:'shortTime' }}
                    </p>
                    <p class="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">
                      {{ user.lastLogin | date:'dd MMM yyyy' }}
                    </p>
                  </div>

                  <div class="opacity-0 group-hover:opacity-100 transition-opacity pl-2">
                    <button class="w-8 h-8 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center text-slate-400 hover:text-orange-500 hover:border-orange-100 hover:bg-orange-50 transition-all">
                      <ion-icon name="chevron-forward-outline"></ion-icon>
                    </button>
                  </div>
                </div>
              }
            </div>
          </div>
        </section>

        <!-- Listings List -->
        <section class="space-y-4">
          <div class="flex items-center justify-between px-2">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Live Inventory (Global)</h3>
            <div class="flex gap-1.5">
               <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mt-1"></div>
               <span class="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Monitoring Active</span>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-3">
            @for (listing of listings(); track listing.id) {
              <div class="group bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md hover:border-orange-100 transition-all flex gap-5 items-center">
                <div class="w-24 h-24 rounded-3xl overflow-hidden bg-slate-50 flex-shrink-0 shadow-inner border border-slate-50 group-hover:scale-105 transition-transform">
                  <img [src]="listing.processedImage || listing.originalImage" 
                       [alt]="listing.name" 
                       referrerpolicy="no-referrer" 
                       class="w-full h-full object-cover">
                </div>
                
                <div class="flex-grow min-w-0 flex flex-col justify-center">
                  <div class="flex items-center gap-2 mb-1">
                    <h4 class="font-black text-slate-800 tracking-tight truncate leading-tight text-lg">{{ listing.name }}</h4>
                    <span class="px-1.5 py-0.5 rounded-full bg-orange-50 text-[8px] font-black text-orange-600 uppercase tracking-tighter border border-orange-100">Live</span>
                  </div>
                  
                  <div class="flex items-center gap-3 text-slate-400">
                    <p class="text-[10px] font-bold truncate flex items-center gap-1">
                      <ion-icon name="finger-print-outline" class="text-[10px]"></ion-icon>
                      {{ listing.uid.substring(0, 12) }}...
                    </p>
                    <div class="w-1 h-1 rounded-full bg-slate-200"></div>
                    <p class="text-[10px] font-bold flex items-center gap-1">
                      <ion-icon name="calendar-outline" class="text-[10px]"></ion-icon>
                      {{ listing.createdAt | date:'dd MMM' }}
                    </p>
                  </div>

                  <div class="flex gap-2 mt-4">
                    <button (click)="viewListing(listing)" 
                            class="px-4 py-1.5 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 transition-colors shadow-sm">
                      Inspect
                    </button>
                    <button (click)="deleteListing(listing.id!)" 
                            class="px-4 py-1.5 rounded-full bg-white border border-red-50 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-colors">
                      Unlist
                    </button>
                  </div>
                </div>

                <div class="text-right flex flex-col justify-between h-20 items-end">
                   <div class="bg-orange-50 px-3 py-1.5 rounded-2xl border border-orange-100">
                     <p class="text-sm font-black text-orange-600">₹{{ listing.priceINR }}</p>
                   </div>
                   <button class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 opacity-0 group-hover:opacity-100 transition-all">
                     <ion-icon name="ellipsis-horizontal"></ion-icon>
                   </button>
                </div>
              </div>
            }
          </div>
        </section>
      }
    </div>
  `
})
export class AdminComponent implements OnInit {
  private adminService = inject(AdminService);
  
  users = signal<UserProfile[]>([]);
  listings = signal<Listing[]>([]);
  loading = signal(false);

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
    if (confirm('Are you sure you want to delete this listing globably?')) {
      await this.adminService.deleteUserListing(id);
      this.loadData();
    }
  }

  viewListing(listing: Listing) {
    // We can emit this to parent to view in Main view
    console.log('Viewing listing', listing);
  }
}
