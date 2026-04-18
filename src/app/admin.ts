import { ChangeDetectionStrategy, Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon, IonLabel, IonBadge, IonSpinner, IonList, IonItem, IonThumbnail } from '@ionic/angular/standalone';
import { AdminService, UserProfile } from './services/admin';
import { Listing } from './services/listing';

@Component({
  selector: 'app-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, IonButton, IonIcon, IonLabel, IonBadge, IonSpinner, IonList, IonItem, IonThumbnail
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
          <h3 class="text-sm font-black text-slate-400 uppercase tracking-widest px-2">Recent Users</h3>
          <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <ion-list lines="full">
              @for (user of users(); track user.uid) {
                <ion-item class="ion-no-padding px-6 py-2">
                  <ion-thumbnail slot="start" class="rounded-xl overflow-hidden">
                    <img [src]="user.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.uid" [alt]="user.displayName" referrerpolicy="no-referrer" />
                  </ion-thumbnail>
                  <ion-label>
                    <h2 class="font-bold text-slate-800">{{ user.displayName || 'Anonymous User' }}</h2>
                    <p class="text-xs text-slate-400">{{ user.email }}</p>
                  </ion-label>
                  <ion-badge slot="end" color="light" class="text-[9px] font-bold tracking-tighter">
                    {{ user.lastLogin | date:'short' }}
                  </ion-badge>
                </ion-item>
              }
            </ion-list>
          </div>
        </section>

        <!-- Listings List -->
        <section class="space-y-4">
          <h3 class="text-sm font-black text-slate-400 uppercase tracking-widest px-2">Live Inventory (Global)</h3>
          <div class="grid grid-cols-1 gap-4">
            @for (listing of listings(); track listing.id) {
              <div class="bg-white p-4 rounded-[2rem] border border-slate-100 flex gap-4 items-center">
                <div class="w-20 h-20 rounded-2xl overflow-hidden bg-slate-50 flex-shrink-0">
                  <img [src]="listing.processedImage || listing.originalImage" [alt]="listing.name" referrerpolicy="no-referrer" class="w-full h-full object-cover">
                </div>
                <div class="flex-grow min-w-0">
                  <h4 class="font-black text-slate-800 tracking-tight truncate">{{ listing.name }}</h4>
                  <p class="text-[10px] font-bold text-slate-400 truncate">Owner UID: {{ listing.uid }}</p>
                  <div class="flex gap-2 mt-2">
                    <ion-button (click)="viewListing(listing)" size="small" fill="clear" class="ion-no-padding mr-2 text-[10px] font-black h-6">VIEW</ion-button>
                    <ion-button (click)="deleteListing(listing.id!)" size="small" fill="clear" color="danger" class="ion-no-padding text-[10px] font-black h-6">DELETE</ion-button>
                  </div>
                </div>
                <div class="text-right">
                   <p class="text-xs font-black text-orange-600">₹{{ listing.priceINR }}</p>
                   <p class="text-[9px] text-slate-400">{{ listing.createdAt | date:'shortDate' }}</p>
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
