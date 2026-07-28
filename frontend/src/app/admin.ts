import { ChangeDetectionStrategy, Component, Injector, computed, inject, output, runInInjectionContext, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonSpinner, ToastController, AlertController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { people, cube, refresh, eye, trash, mailOutline, create, cash, search } from 'ionicons/icons';
import { AdminService, UserProfile } from './services/admin';
import { Listing, ListingService, Sale } from './services/listing';
import { parsePrice } from './utils/price';

const ROLES = ['FREE', 'PAID_PRO', 'ADMIN'] as const;
const SALE_PLATFORMS: Sale['platform'][] = ['Amazon', 'Flipkart', 'Meesho', 'Instagram', 'Offline', 'Other'];

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
          <div class="flex items-center justify-between px-2 gap-4 flex-wrap">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Registered Users</h3>
            <div class="flex items-center gap-3">
              <span class="text-[9px] font-bold text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">{{ filteredUsers().length }} of {{ users().length }}</span>
              <div class="relative">
                <ion-icon name="search" class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></ion-icon>
                <input
                  type="text"
                  placeholder="Search name or email…"
                  class="text-xs font-medium pl-8 pr-3 py-2 rounded-xl border border-slate-100 bg-white w-56 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  [value]="userSearch()"
                  (input)="userSearch.set($any($event.target).value)"
                />
              </div>
            </div>
          </div>

          <div class="bg-white border border-slate-100 rounded-[2.5rem] shadow-xl shadow-slate-200/40 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse min-w-[680px]">
                <thead>
                  <tr class="bg-slate-950">
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">User</th>
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">Role</th>
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300 text-center">Total Usage</th>
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300 text-right">Last Login</th>
                    <th class="py-3 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (user of filteredUsers(); track user.uid) {
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
                        <select
                          class="text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border border-slate-100 bg-slate-50 text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50"
                          [class.bg-slate-950]="user.role === 'ADMIN'"
                          [class.text-white]="user.role === 'ADMIN'"
                          [class.bg-orange-100]="user.role === 'PAID_PRO'"
                          [class.text-orange-600]="user.role === 'PAID_PRO'"
                          [disabled]="savingRole() === user.uid"
                          [value]="user.role"
                          (change)="changeRole(user, $any($event.target).value)"
                          aria-label="Change role for {{ user.displayName || user.email }}">
                          @for (role of roles; track role) {
                            <option [value]="role">{{ role === 'PAID_PRO' ? 'PRO' : role }}</option>
                          }
                        </select>
                      </td>
                      <td class="py-3 px-3 text-center">
                        <span class="text-sm font-bold text-slate-700 tabular-nums">{{ user.usageCount || 0 }}</span>
                      </td>
                      <td class="py-3 px-3 text-right">
                        <p class="text-sm font-bold text-slate-900 leading-none tabular-nums">{{ user.lastLogin | date:'shortTime' }}</p>
                        <p class="text-[9px] font-bold text-slate-400 mt-1.5 uppercase tracking-widest">{{ user.lastLogin | date:'dd MMM yyyy' }}</p>
                      </td>
                      <td class="py-3 px-3 text-right">
                        <button (click)="editUser(user)" class="btn-icon-premium w-9 h-9" aria-label="Edit {{ user.displayName || user.email }}">
                          <ion-icon name="create"></ion-icon>
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="5" class="py-16 text-center text-sm font-medium text-slate-400">
                        {{ userSearch() ? 'No users match your search.' : 'No users registered yet.' }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- Listings Table -->
        <section class="space-y-4 pt-4">
          <div class="flex items-center justify-between px-2 gap-4 flex-wrap">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">All Saved Listings</h3>
            <div class="flex items-center gap-3">
              <span class="text-[9px] font-bold text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">{{ filteredListings().length }} of {{ listings().length }}</span>
              <div class="relative">
                <ion-icon name="search" class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></ion-icon>
                <input
                  type="text"
                  placeholder="Search product name…"
                  class="text-xs font-medium pl-8 pr-3 py-2 rounded-xl border border-slate-100 bg-white w-56 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  [value]="listingSearch()"
                  (input)="listingSearch.set($any($event.target).value)"
                />
              </div>
            </div>
          </div>

          <div class="bg-white border border-slate-100 rounded-[2.5rem] shadow-xl shadow-slate-200/40 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse min-w-[720px]">
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
                  @for (listing of filteredListings(); track listing.id) {
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
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{{ listing.quantity ?? 0 }} in stock</p>
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
                          <button (click)="logSale(listing)" class="btn-icon-premium w-9 h-9 text-emerald-600 hover:text-white hover:bg-emerald-600 hover:border-emerald-600" aria-label="Log a sale for {{ listing.name }}">
                            <ion-icon name="cash"></ion-icon>
                          </button>
                          <button (click)="editListing(listing)" class="btn-icon-premium w-9 h-9" aria-label="Edit {{ listing.name }}">
                            <ion-icon name="create"></ion-icon>
                          </button>
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
                      <td colspan="5" class="py-16 text-center text-sm font-medium text-slate-400">
                        {{ listingSearch() ? 'No listings match your search.' : 'No listings saved yet.' }}
                      </td>
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
  private listingService = inject(ListingService);
  private injector = inject(Injector);

  /** Lazily injected — Ionic overlay controllers as field initializers can throw NG0203, and
   * are unavailable during SSR, so both the injection and every call site stay optional. */
  private get toastController(): ToastController | null {
    return runInInjectionContext(this.injector, () => inject(ToastController, { optional: true }));
  }

  private get alertController(): AlertController | null {
    return runInInjectionContext(this.injector, () => inject(AlertController, { optional: true }));
  }

  view = output<Listing>();

  protected readonly roles = ROLES;

  users = signal<UserProfile[]>([]);
  listings = signal<Listing[]>([]);
  loading = signal(false);
  savingRole = signal<string | null>(null);

  userSearch = signal('');
  listingSearch = signal('');

  filteredUsers = computed(() => {
    const query = this.userSearch().trim().toLowerCase();
    if (!query) return this.users();
    return this.users().filter(
      (u) => (u.displayName || '').toLowerCase().includes(query) || (u.email || '').toLowerCase().includes(query),
    );
  });

  filteredListings = computed(() => {
    const query = this.listingSearch().trim().toLowerCase();
    if (!query) return this.listings();
    return this.listings().filter((l) => l.name.toLowerCase().includes(query));
  });

  constructor() {
    addIcons({ people, cube, refresh, eye, trash, mailOutline, create, cash, search });
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

  /** Promotes/demotes a user in place — this is how a new admin is created (no separate signup needed). */
  async changeRole(user: UserProfile, role: string) {
    if (role === user.role) return;
    const previousRole = user.role;
    this.savingRole.set(user.uid);
    this.users.update((list) => list.map((u) => (u.uid === user.uid ? { ...u, role } : u)));

    try {
      await this.adminService.updateUser(user.uid, { role });
      await this.presentToast(
        role === 'ADMIN'
          ? `${user.displayName || user.email} is now an Admin.`
          : `${user.displayName || user.email}'s role is now ${role === 'PAID_PRO' ? 'Pro' : role}.`,
      );
    } catch (err) {
      console.error('Role update failed', err);
      this.users.update((list) => list.map((u) => (u.uid === user.uid ? { ...u, role: previousRole } : u)));
      await this.presentToast('Failed to update role. Please try again.', 'danger');
    } finally {
      this.savingRole.set(null);
    }
  }

  async editUser(user: UserProfile) {
    const alert = await this.alertController?.create({
      header: 'Edit User',
      subHeader: user.email || undefined,
      inputs: [
        { name: 'displayName', type: 'text', placeholder: 'Display name', value: user.displayName || '' },
        { name: 'phoneNumber', type: 'tel', placeholder: 'Phone number', value: user.phoneNumber || '' },
        { name: 'gstNumber', type: 'text', placeholder: 'GST number', value: user.gstNumber || '' },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (data) => {
            try {
              await this.adminService.updateUser(user.uid, {
                displayName: String(data.displayName ?? '').trim(),
                phoneNumber: String(data.phoneNumber ?? '').trim(),
                gstNumber: String(data.gstNumber ?? '').trim(),
              });
              await this.loadData();
              await this.presentToast('User updated.');
            } catch (err) {
              console.error('User edit failed', err);
              await this.presentToast('Failed to update user. Please try again.', 'danger');
            }
          },
        },
      ],
    });
    if (alert) await alert.present();
  }

  async editListing(listing: Listing) {
    const currentPrice = listing.sellingPrice ?? this.price(listing.priceINR);
    const alert = await this.alertController?.create({
      header: 'Edit Listing',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Product name', value: listing.name },
        { name: 'sellingPrice', type: 'number', placeholder: 'Selling price (₹)', value: currentPrice },
        { name: 'quantity', type: 'number', placeholder: 'Stock quantity', value: listing.quantity ?? 0 },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (data) => {
            const sellingPrice = Number(data.sellingPrice) || 0;
            try {
              await this.adminService.updateUserListing(listing.id!, {
                name: String(data.name || listing.name).trim(),
                sellingPrice,
                priceINR: `₹${sellingPrice}`,
                quantity: parseInt(data.quantity || '0', 10),
              });
              await this.loadData();
              await this.presentToast('Listing updated.');
            } catch (err) {
              console.error('Listing edit failed', err);
              await this.presentToast('Failed to update listing. Please try again.', 'danger');
            }
          },
        },
      ],
    });
    if (alert) await alert.present();
  }

  async logSale(listing: Listing) {
    const alert = await this.alertController?.create({
      header: 'Log a Sale',
      subHeader: listing.name,
      message: `Platform: ${SALE_PLATFORMS.join(', ')}`,
      inputs: [
        { name: 'platform', type: 'text', placeholder: 'Platform', value: 'Amazon' },
        { name: 'quantity', type: 'number', placeholder: 'Quantity sold', value: 1, min: 1 },
        { name: 'salePrice', type: 'number', placeholder: 'Sale price per unit (₹)', value: listing.sellingPrice || this.price(listing.priceINR) },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Log Sale',
          handler: async (data) => {
            const platform: Sale['platform'] = SALE_PLATFORMS.includes(data.platform) ? data.platform : 'Other';
            const quantity = parseInt(data.quantity || '0', 10);
            if (quantity <= 0) {
              await this.presentToast('Enter a quantity greater than zero.', 'danger');
              return;
            }
            try {
              await this.listingService.logSale({
                listingId: listing.id!,
                platform,
                quantity,
                salePrice: Number(data.salePrice) || 0,
              });
              const newQty = Math.max(0, (listing.quantity ?? 0) - quantity);
              await this.adminService.updateUserListing(listing.id!, { quantity: newQty });
              await this.loadData();
              await this.presentToast('Sale logged and inventory updated.');
            } catch (err) {
              console.error('Log sale failed', err);
              await this.presentToast('Failed to log sale. Please try again.', 'danger');
            }
          },
        },
      ],
    });
    if (alert) await alert.present();
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

  private async presentToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastController?.create({ message, duration: 2500, color, position: 'bottom' });
    if (toast) await toast.present();
  }
}
