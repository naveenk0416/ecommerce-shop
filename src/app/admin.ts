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

        <!-- Users List -->
        <section class="space-y-4 pt-4">
          <div class="flex items-center justify-between px-2">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Recent Access Activity</h3>
            <span class="text-[9px] font-bold text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">Live Updates</span>
          </div>

          <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div class="divide-y divide-slate-50">
              @for (user of users(); track user.uid) {
                <div class="group flex items-center gap-4 px-8 py-6 hover:bg-slate-50/50 transition-colors cursor-default">
                  <div class="relative flex-shrink-0">
                    <div class="w-14 h-14 rounded-2xl overflow-hidden shadow-sm border border-slate-100 ring-2 ring-white ring-offset-2 ring-offset-slate-50 group-hover:ring-orange-100 transition-all">
                      <img [src]="user.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.uid" 
                           [alt]="user.displayName" 
                           referrerpolicy="no-referrer"
                           class="w-full h-full object-cover">
                    </div>
                    @if (user.lastLogin) {
                      <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    }
                  </div>

                  <div class="flex-grow min-w-0">
                    <div class="flex items-center gap-2">
                      <h4 class="font-bold text-slate-800 tracking-tight truncate leading-tight text-lg">
                        {{ user.displayName || 'Anonymous User' }}
                      </h4>
                      @if (!user.displayName) {
                        <span class="px-1.5 py-0.5 rounded bg-slate-100 text-[8px] font-black text-slate-400 uppercase tracking-widest">Guest</span>
                      }
                    </div>
                    <p class="text-[11px] text-slate-400 font-medium truncate flex items-center gap-1.5 mt-1 border-dotted border-b border-slate-200 pb-0.5 w-fit">
                      <ion-icon name="mail-outline" class="text-[10px] text-orange-500"></ion-icon>
                      {{ user.email }}
                    </p>
                  </div>

                  <div class="text-right flex-shrink-0">
                    <p class="text-sm font-black text-slate-900 leading-none tabular-nums font-mono">
                      {{ user.lastLogin | date:'shortTime' }}
                    </p>
                    <p class="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-widest">
                      {{ user.lastLogin | date:'dd MMM yyyy' }}
                    </p>
                  </div>

                  <div class="opacity-0 group-hover:opacity-100 transition-opacity pl-2">
                    <button class="btn-icon-premium w-10 h-10" aria-label="Admin Action">
                      <ion-icon name="chevron-forward-outline"></ion-icon>
                    </button>
                  </div>
                </div>
              }
            </div>
          </div>
        </section>

        <!-- Listings List -->
        <section class="space-y-4 pt-4">
          <div class="flex items-center justify-between px-2">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Global Asset Stream</h3>
            <div class="flex gap-1.5">
               <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mt-1"></div>
               <span class="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Monitoring Active</span>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4">
            @for (listing of listings(); track listing.id) {
              <div class="group bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-premium transition-all flex gap-6 items-center">
                <div class="w-28 h-28 rounded-3xl overflow-hidden bg-slate-50 flex-shrink-0 shadow-inner border border-slate-50 group-hover:scale-105 transition-transform duration-700">
                  <img [src]="listing.processedImage || listing.originalImage" 
                       [alt]="listing.name" 
                       referrerpolicy="no-referrer" 
                       class="w-full h-full object-cover">
                </div>
                
                <div class="flex-grow min-w-0 flex flex-col justify-center">
                  <div class="flex items-center gap-3 mb-2">
                    <h4 class="font-black text-slate-900 tracking-tight truncate leading-tight text-xl font-display italic uppercase">{{ listing.name }}</h4>
                    <span class="px-2 py-0.5 rounded-lg bg-orange-600 text-white text-[8px] font-black uppercase tracking-widest shadow-lg shadow-orange-600/20">Active</span>
                  </div>
                  
                  <div class="flex items-center gap-4 text-slate-400 mb-6">
                    <p class="text-[10px] font-bold truncate flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-lg">
                      <ion-icon name="finger-print-outline" class="text-slate-950"></ion-icon>
                      {{ listing.uid.substring(0, 12) }}...
                    </p>
                    <p class="text-[10px] font-bold flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-lg">
                      <ion-icon name="calendar-outline" class="text-orange-500"></ion-icon>
                      {{ listing.createdAt | date:'dd MMM' }}
                    </p>
                  </div>

                  <div class="flex gap-2">
                    <button (click)="viewListing(listing)" 
                            class="btn-primary h-9 px-6 text-[9px]">
                      Inspect Asset
                    </button>
                    <button (click)="deleteListing(listing.id!)" 
                            class="btn-secondary h-9 px-6 text-[9px] text-red-500 border-red-50 hover:bg-red-50">
                      Unlist
                    </button>
                  </div>
                </div>

                <div class="text-right flex flex-col justify-between h-24 items-end py-1">
                   <div class="bg-slate-950 px-4 py-2 rounded-2xl shadow-xl shadow-slate-950/10">
                     <p class="text-lg font-black text-white tabular-nums">₹{{ listing.priceINR }}</p>
                   </div>
                   <button class="btn-icon-premium w-10 h-10 opacity-0 group-hover:opacity-100 transition-all" aria-label="More Actions">
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
