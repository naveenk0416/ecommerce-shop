import { ChangeDetectionStrategy, Component, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { AdminService, UserProfile } from './services/admin';
import { Listing } from './services/listing';

@Component({
  selector: 'app-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon, IonSpinner],
  template: `
    <div class="admin-panel p-10 space-y-10 pb-20 bg-gradient-to-br from-slate-50 via-white to-orange-50 min-h-screen">
      <header class="flex items-center justify-between mb-2">
        <h2 class="text-3xl font-black text-slate-900 tracking-tight font-display italic uppercase">Admin Analytics Hub</h2>
        <button (click)="loadData()" [disabled]="loading()" class="btn-secondary h-10 px-4">Reload</button>
      </header>

      @if (loading()) {
        <div class="flex justify-center py-20"><ion-spinner name="crescent" color="primary"></ion-spinner></div>
      } @else {
        <div class="grid md:grid-cols-3 gap-4">
          <div class="rounded-3xl p-6 bg-slate-950 text-white"><p>Total Users</p><p class="text-4xl font-black">{{ users().length }}</p></div>
          <div class="rounded-3xl p-6 bg-orange-600 text-white"><p>Total Listings</p><p class="text-4xl font-black">{{ listings().length }}</p></div>
          <div class="rounded-3xl p-6 bg-white border"><p>Data Source</p><p class="text-2xl font-black uppercase">{{ source() }}</p></div>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          <div class="bg-white rounded-3xl p-6 border shadow-sm">
            <h3 class="font-black mb-4">User Role Pie Chart</h3>
            <div class="w-52 h-52 rounded-full mx-auto" [style.background]="userChart()"></div>
          </div>
          <div class="bg-white rounded-3xl p-6 border shadow-sm">
            <h3 class="font-black mb-4">Listing Status Pie Chart</h3>
            <div class="w-52 h-52 rounded-full mx-auto" [style.background]="listingChart()"></div>
          </div>
        </div>
      }
    </div>
  `
})
export class AdminComponent implements OnInit {
  private adminService = inject(AdminService);
  users = signal<UserProfile[]>([]);
  listings = signal<Listing[]>([]);
  source = signal<'mongodb' | 'fallback'>('fallback');
  loading = signal(false);

  userChart = computed(() => {
    const total = this.users().length || 1;
    const roles = {
      admin: this.users().filter(u => u.role === 'admin').length,
      seller: this.users().filter(u => u.role === 'seller').length,
      buyer: this.users().filter(u => !u.role || u.role === 'buyer').length,
    };
    const a = (roles.admin / total) * 360;
    const s = (roles.seller / total) * 360;
    return `conic-gradient(#0f172a 0deg ${a}deg, #f97316 ${a}deg ${a + s}deg, #22c55e ${a + s}deg 360deg)`;
  });

  listingChart = computed(() => {
    const total = this.listings().length || 1;
    const active = this.listings().filter(l => (l as any).status === 'active').length;
    const draft = this.listings().filter(l => (l as any).status === 'draft').length;
    const a = (active / total) * 360;
    const d = (draft / total) * 360;
    return `conic-gradient(#2563eb 0deg ${a}deg, #eab308 ${a}deg ${a + d}deg, #94a3b8 ${a + d}deg 360deg)`;
  });

  ngOnInit() { this.loadData(); }

  async loadData() {
    this.loading.set(true);
    try {
      const payload = await this.adminService.getDashboardData();
      this.users.set(payload.users || []);
      this.listings.set(payload.listings || []);
      this.source.set(payload.source || 'fallback');
    } finally {
      this.loading.set(false);
    }
  }
}
