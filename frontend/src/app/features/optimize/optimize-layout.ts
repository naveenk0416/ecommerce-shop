import { ChangeDetectionStrategy, Component, Injector, computed, effect, inject, runInInjectionContext, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MarketplaceIcon } from '../listing-workspace/ui/marketplace-icon/marketplace-icon';
import { computeMarketplaceRows } from './optimize-readiness.util';
import { OptimizeSessionService } from './optimize-session.service';
import { AuthService } from '../../services/auth';
import { ListingPreviewDialog } from './listing-preview-dialog';
import { WalletService } from '../../services/wallet';
import { LanguageService } from '../../services/language';
import { WalletNudges } from './wallet/wallet-nudges';
import { AccountNudges } from './onboarding/account-nudges';
import { FeatureService } from '../../services/features';
import { BatchService } from '../../services/batch';

/** Marketplace / output tabs: they show the open product's content. */
const MARKETPLACE_TABS: ReadonlySet<string> = new Set(['amazon', 'flipkart', 'meesho', 'instagram', 'insights', 'readiness', 'publish', 'export']);
/** Pages where the product-editor header makes sense. */
const EDITOR_TABS: ReadonlySet<string> = new Set(['general', ...MARKETPLACE_TABS]);

@Component({
  selector: 'app-optimize-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, MatButtonModule, MatIconModule, MatMenuModule, MarketplaceIcon, WalletNudges, AccountNudges],
  templateUrl: './optimize-layout.html',
  styleUrl: './optimize-layout.scss',
})
export class OptimizeLayout {
  protected readonly session = inject(OptimizeSessionService);
  protected readonly auth = inject(AuthService);
  protected readonly wallet = inject(WalletService);
  protected readonly i18n = inject(LanguageService);
  protected readonly features = inject(FeatureService);
  /** "Add many products" keeps running on the server; the badge follows it from any page. */
  protected readonly batch = inject(BatchService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  marketplaceRows = computed(() => computeMarketplaceRows(this.session.allResults(), this.auth.profile()?.marketplaces));
  /** Every channel with whether it can really be published to today (see FeatureService). */
  publishMenuRows = computed(() => this.marketplaceRows().map((row) => ({ ...row, live: this.features.isLive(row.marketplace as 'amazon' | 'flipkart' | 'meesho' | 'instagram') })));
  /** Only channels that are live AND ready count — "Coming soon" channels never do. */
  readyCount = computed(() => this.publishMenuRows().filter((row) => row.ready && row.live).length);
  publishLabel = computed(() => {
    const n = this.readyCount();
    return this.i18n.t(`Publish to ${n} channel${n === 1 ? '' : 's'}`, `${n} channel पर publish करें`);
  });

  /** The child page: 'general', 'inventory', 'amazon' … from /optimize/<page>. */
  private readonly url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map((e) => e.urlAfterRedirects)),
    // While the first navigation into /optimize is still running, router.url is the old URL.
    { initialValue: this.router.currentNavigation()?.finalUrl?.toString() ?? this.router.url },
  );
  readonly currentTab = computed(() => /^\/optimize\/([^/?#]+)/.exec(this.url())?.[1] ?? 'general');

  /** "Untitled Product · Draft · Publish to N channels" only where a product is being edited. */
  readonly showEditorHeader = computed(() =>
    EDITOR_TABS.has(this.currentTab()) && (this.session.imagePreview() !== null || !!this.session.draftId() || this.session.loadingDraft()));

  /** Plain page title for every other page; null when the page already shows its own heading. */
  readonly plainTitle = computed(() => {
    const titles: Record<string, [string, string]> = {
      general: ['General Details', 'General Details'],
      inventory: ['Inventory', 'Inventory'],
      amazon: ['Amazon listing', 'Amazon listing'],
      flipkart: ['Flipkart listing', 'Flipkart listing'],
      meesho: ['Meesho listing', 'Meesho listing'],
      instagram: ['Instagram content', 'Instagram content'],
      insights: ['AI Insights', 'AI Insights'],
      readiness: ['Marketplace Readiness', 'Marketplace Readiness'],
      publish: ['Publish Center', 'Publish Center'],
      export: ['Export Center', 'Export Center'],
    };
    const title = titles[this.currentTab()];
    return title ? this.i18n.t(title[0], title[1]) : null;
  });

  productTitle = computed(() => {
    const result = this.session.getResult('general');
    return result?.['productTitle']?.values?.[0]?.trim() || 'Untitled Product';
  });

  /** "Draft", "Saving…", "Saved", "Saved to inventory" or "Not saved" for the header pill. */
  statusLabel = computed(() => {
    const state = this.session.saveState();
    if (state === 'saving') return 'Saving…';
    if (state === 'error') return 'Not saved — retrying on next edit';
    if (this.session.draftStatus() === 'saved') return 'In inventory';
    return this.session.draftId() ? 'Draft saved' : 'Draft';
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

  constructor() {
    // ?id=<draft> is the source of truth: refresh, back/forward and "Open" from My Listings all
    // land here. No id means a fresh, unsaved product.
    // Marketplace tabs opened without an id (sidebar from Inventory, a bookmark) reopen the listing
    // the seller last had open instead of showing an empty tab. Runs on every navigation, since
    // moving between two pages without ?id doesn't change the query params.
    effect(() => {
      const url = this.url();
      const tab = this.currentTab();
      untracked(() => {
        const tree = this.router.parseUrl(url);
        const id = tree.queryParamMap.get('id');
        if (id) {
          void this.session.loadDraft(id);
          return;
        }
        const lastId = MARKETPLACE_TABS.has(tab) ? this.session.lastOpenedId() : null;
        if (lastId) {
          tree.queryParams = { ...tree.queryParams, id: lastId };
          void this.router.navigateByUrl(tree, { replaceUrl: true });
        } else if (this.session.draftId()) {
          this.session.reset();
        }
      });
    });
    void this.features.load();
    if (this.auth.user()) void this.batch.refresh().then((b) => b && ['queued', 'running', 'paused'].includes(b.status) && this.batch.watch());
  }

  scoreTier(score: number): 'high' | 'medium' | 'low' {
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  openPreview(): void {
    runInInjectionContext(this.injector, () => inject(MatDialog)).open(ListingPreviewDialog, {
      data: this.session.allResults(),
      width: '640px',
      maxWidth: '95vw',
    });
  }

  /** Starts a new product. The current listing is already saved in My Listings (if generated). */
  startNewProduct(): void {
    if (this.session.hasImage() && !this.session.draftId() && !confirm('Start a new product? This photo hasn\'t been processed yet and will be discarded.')) {
      return;
    }
    this.session.reset();
    this.router.navigate(['/optimize/general']);
  }
}
