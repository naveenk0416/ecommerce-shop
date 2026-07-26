import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MarketplaceIcon } from '../listing-workspace/ui/marketplace-icon/marketplace-icon';
import { computeMarketplaceRows } from './optimize-readiness.util';
import { OptimizeSessionService } from './optimize-session.service';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-optimize-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, MatButtonModule, MatIconModule, MarketplaceIcon],
  templateUrl: './optimize-layout.html',
  styleUrl: './optimize-layout.scss',
})
export class OptimizeLayout {
  protected readonly session = inject(OptimizeSessionService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  marketplaceRows = computed(() => computeMarketplaceRows(this.session.allResults()));
  readyCount = computed(() => this.marketplaceRows().filter((row) => row.ready).length);

  productTitle = computed(() => {
    const result = this.session.getResult('general');
    return result?.['productTitle']?.values?.[0]?.trim() || 'Untitled Product';
  });

  accountName = computed(() => {
    const user = this.auth.user();
    return user?.displayName?.trim() || user?.email?.split('@')[0] || 'Guest Seller';
  });

  accountRole = computed(() => {
    const role = this.auth.profile()?.role;
    if (!this.auth.user()) return 'Not signed in';
    if (role === 'ADMIN') return 'Admin account';
    if (role === 'PAID_PRO') return 'Pro seller account';
    return 'Seller account';
  });

  accountInitials = computed(() => {
    const parts = this.accountName().trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  });

  scoreTier(score: number): 'high' | 'medium' | 'low' {
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  /** Clears the current draft (photo + every generated tab) so a new product can be uploaded. */
  startNewProduct(): void {
    if (this.session.hasImage() && !confirm('Start a new product? Your current unsaved draft will be discarded.')) {
      return;
    }
    this.session.reset();
    this.router.navigate(['/optimize/general']);
  }
}
