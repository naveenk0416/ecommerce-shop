import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, effect, inject, runInInjectionContext, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { UiCard } from '../../listing-workspace/ui/card/card';
import { AuthService } from '../../../services/auth';
import { DEFAULT_LOW_STOCK_THRESHOLD, Listing, ListingService, isLowStock, lowStockThresholdOf } from '../../../services/listing';
import { MarketplaceConnectionsService } from '../../../services/marketplace-connections';
import { parsePrice } from '../../../utils/price';
import { formatGstRate, formatInrCompact } from '../../../utils/format';
import { ProductFormDialog, ProductFormResult } from './product-form-dialog';
import { LogSaleDialog, LogSaleResult } from './log-sale-dialog';
import { CreateAmazonListingDialog } from './create-amazon-listing-dialog';
import { ConfirmActionData, ConfirmActionDialog } from '../confirm-action-dialog';
import { WalletService } from '../../../services/wallet';
import { FeatureService, NotifyFeature } from '../../../services/features';
import { LanguageService } from '../../../services/language';
import { CHANNEL_LABELS, ComingSoonChannel } from '../coming-soon/coming-soon-publish';

@Component({
  selector: 'app-optimize-inventory',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DecimalPipe, MatButtonModule, MatIconModule, MatTooltipModule, MatMenuModule, UiCard],
  templateUrl: './optimize-inventory.html',
  styleUrl: './optimize-inventory.scss',
})
export class OptimizeInventory {
  protected readonly auth = inject(AuthService);
  private readonly listingService = inject(ListingService);
  private readonly marketplaceConnections = inject(MarketplaceConnectionsService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  /** Coin balance changes after the first publish (+5) — refreshed on success. */
  private readonly wallet = inject(WalletService);
  protected readonly features = inject(FeatureService);
  protected readonly i18n = inject(LanguageService);

  /** New-listing channels that aren't live yet — shown as "Coming soon" in the per-product publish menu. */
  protected readonly comingSoonChannels = computed(() =>
    (Object.keys(CHANNEL_LABELS) as ComingSoonChannel[])
      .filter((channel) => !this.features.isLive(channel))
      .map((channel) => ({ channel, label: CHANNEL_LABELS[channel], requested: this.features.notified().has(`${channel}_publish`) })),
  );

  protected readonly defaultThreshold = DEFAULT_LOW_STOCK_THRESHOLD;
  protected readonly formatInr = formatInrCompact;
  protected readonly formatGst = formatGstRate;
  protected readonly isLowStock = isLowStock;
  protected readonly thresholdOf = lowStockThresholdOf;

  /** MatDialog/MatSnackBar are constructed lazily on first use, in a guaranteed injection
   * context — constructing them eagerly as field initializers can throw NG0203 for lazy-loaded
   * standalone routes. */
  private get dialog(): MatDialog {
    return runInInjectionContext(this.injector, () => inject(MatDialog));
  }

  private get snackBar(): MatSnackBar {
    return runInInjectionContext(this.injector, () => inject(MatSnackBar));
  }

  listings = signal<Listing[]>([]);
  searchQuery = signal('');
  syncingAmazon = signal(false);
  syncingFlipkart = signal(false);
  /** Id of the listing currently being published, if any — drives the per-row loading state on
   * the Publish button (only one publish in flight at a time, simplest to reason about). */
  publishingListingId = signal<string | null>(null);

  /** One row per product. The summary cards use this same list, so cards and table always agree. */
  uniqueListings = computed(() => Array.from(new Map(this.listings().map((item) => [item.id, item])).values()));

  filteredListings = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const unique = this.uniqueListings();
    if (!query) return unique;
    return unique.filter(
      (l) =>
        l.name.toLowerCase().includes(query) ||
        (l.category || '').toLowerCase().includes(query) ||
        (l.hsnCode || '').toLowerCase().includes(query),
    );
  });

  totalValue = computed(() => this.uniqueListings().reduce((sum, l) => sum + this.priceOf(l) * Number(l.quantity ?? 0), 0));
  totalProfit = computed(() => this.uniqueListings().reduce((sum, l) => sum + this.getProfit(l), 0));
  lowStockCount = computed(() => this.uniqueListings().filter((l) => isLowStock(l)).length);

  constructor() {
    void this.features.load();
    effect((onCleanup) => {
      const user = this.auth.user();
      if (!user) {
        this.listings.set([]);
        return;
      }
      const onError = (error: unknown) => {
        this.snackBar.open(
          (error instanceof Error && error.message) || 'Failed to load your products. Please refresh.',
          'Dismiss',
          { duration: 5000 },
        );
      };
      const stop = this.auth.isAdmin()
        ? this.listingService.getAllListings((listings) => this.setFromPoll(listings), true, onError)
        : this.listingService.getListings(user.uid, (listings) => this.setFromPoll(listings), true, onError);
      onCleanup(() => stop());
    });
  }

  /** Listings changed locally in the last few seconds — a poll that was already in flight must not
   * briefly show their old values (e.g. stock jumping back from 3 to 4 after a sale). */
  private recentLocal = new Map<string, { listing: Listing; until: number }>();
  private deletedLocal = new Map<string, number>();

  private setFromPoll(listings: Listing[]): void {
    const now = Date.now();
    for (const [id, entry] of this.recentLocal) if (entry.until < now) this.recentLocal.delete(id);
    for (const [id, until] of this.deletedLocal) if (until < now) this.deletedLocal.delete(id);
    const merged = listings
      .filter((l) => !l.id || !this.deletedLocal.has(l.id))
      .map((l) => (l.id && this.recentLocal.has(l.id) ? { ...l, ...this.recentLocal.get(l.id)!.listing } : l));
    for (const [id, entry] of this.recentLocal) if (!merged.some((l) => l.id === id)) merged.unshift(entry.listing);
    this.listings.set(merged);
  }

  /** Applies a server response to the table (and therefore the cards) without waiting for the next poll. */
  private upsertLocal(listing: Listing | null | undefined): void {
    if (!listing?.id) return;
    this.recentLocal.set(listing.id, { listing, until: Date.now() + 8000 });
    this.listings.update((list) => {
      const exists = list.some((l) => l.id === listing.id);
      return exists ? list.map((l) => (l.id === listing.id ? { ...l, ...listing } : l)) : [listing, ...list];
    });
  }

  private confirm(data: ConfirmActionData): Promise<boolean> {
    return firstValueFrom(this.dialog.open<ConfirmActionDialog, ConfirmActionData, boolean>(ConfirmActionDialog, { data, width: '480px', maxWidth: '95vw' }).afterClosed()).then((ok) => !!ok);
  }

  /** Imports the seller's Amazon catalog into Inventory (read-only on Amazon's side). */
  async syncAmazon(): Promise<void> {
    const ok = await this.confirm({
      title: 'Sync from Amazon?',
      intro: 'SellAssist will read your Amazon listings and update your SellAssist inventory.',
      items: [{ heading: 'Amazon', lines: ['Imports new Amazon listings into Inventory', 'Overwrites price and stock of already-synced products in SellAssist with Amazon\'s values', 'Does not change anything on Amazon'] }],
      confirmLabel: 'Sync from Amazon',
    });
    if (!ok) return;
    this.syncingAmazon.set(true);
    try {
      const result = await this.marketplaceConnections.syncAmazonInventory();
      const imageNote = result.imagesFetched > 0 ? ` ${result.imagesFetched} images fetched.` : '';
      this.snackBar.open(`Synced ${result.total} Amazon listings (${result.imported} new, ${result.updated} updated).${imageNote}`, 'Dismiss', { duration: 4000 });
    } catch (error) {
      this.snackBar.open((error instanceof Error && error.message) || 'Failed to sync Amazon inventory. Please try again.', 'Dismiss', { duration: 5000 });
    } finally {
      this.syncingAmazon.set(false);
    }
  }

  /** Imports the seller's Flipkart catalog into Inventory (read-only on Flipkart's side). */
  async syncFlipkart(): Promise<void> {
    const ok = await this.confirm({
      title: 'Sync from Flipkart?',
      intro: 'SellAssist will read your Flipkart listings and update your SellAssist inventory.',
      items: [{ heading: 'Flipkart', lines: ['Imports new Flipkart listings into Inventory', 'Overwrites price and stock of already-synced products in SellAssist with Flipkart\'s values', 'Does not change anything on Flipkart'] }],
      confirmLabel: 'Sync from Flipkart',
    });
    if (!ok) return;
    this.syncingFlipkart.set(true);
    try {
      const result = await this.marketplaceConnections.syncFlipkartInventory();
      this.snackBar.open(`Synced ${result.total} Flipkart listings (${result.imported} new, ${result.updated} updated).`, 'Dismiss', { duration: 4000 });
    } catch (error) {
      this.snackBar.open((error instanceof Error && error.message) || 'Failed to sync Flipkart inventory. Please try again.', 'Dismiss', { duration: 5000 });
    } finally {
      this.syncingFlipkart.set(false);
    }
  }

  priceOf(listing: Listing): number {
    return Number(listing.sellingPrice) || parsePrice(listing.priceINR);
  }

  getProfit(listing: Listing): number {
    const sell = this.priceOf(listing);
    const cost = Number(listing.costPrice) || 0;
    if (!cost) return 0;
    return (sell - cost) * Number(listing.quantity ?? 0);
  }

  openAddDialog(): void {
    this.dialog
      .open<ProductFormDialog, Listing | null, ProductFormResult>(ProductFormDialog, { data: null, maxWidth: '95vw' })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.listingService
          .saveListing({ ...result, priceINR: `₹${result.sellingPrice}`, material: '', variations: [], platformContent: {} })
          .then((saved) => {
            this.upsertLocal(saved);
            this.snackBar.open('Product added successfully.', 'Dismiss', { duration: 3000 });
          })
          .catch((error) => this.snackBar.open((error instanceof Error && error.message) || 'Failed to add product. Please try again.', 'Dismiss', { duration: 4000 }));
      });
  }

  /**
   * Pushes a listing's saved price/quantity to the live marketplace listing it was synced from —
   * only after the seller confirms exactly what will change.
   */
  async publish(listing: Listing): Promise<void> {
    if (!listing.id || !listing.source) return;
    const marketplaceName = listing.source === 'amazon' ? 'Amazon' : 'Flipkart';
    const ok = await this.confirm({
      title: `Update live ${marketplaceName} listing?`,
      intro: 'This changes your live marketplace listing right away.',
      items: [{
        heading: `${marketplaceName} — ${listing.name}`,
        lines: [
          `SKU: ${listing.sku || listing.flipkartProductId || '—'}`,
          `Price: ₹${this.priceOf(listing).toLocaleString('en-IN')}${listing.mrp ? ` (MRP ₹${Number(listing.mrp).toLocaleString('en-IN')})` : ''}`,
          `Stock: ${Number(listing.quantity ?? 0)} units`,
          listing.source === 'amazon' ? 'Product image is re-sent to Amazon' : 'Title and content are not changed',
        ],
      }],
      confirmLabel: `Publish to ${marketplaceName}`,
      warning: `Buyers on ${marketplaceName} will see the new price and stock.`,
    });
    if (!ok) return;

    this.publishingListingId.set(listing.id);
    try {
      if (listing.source === 'amazon') {
        await this.marketplaceConnections.publishAmazonListing(listing.id);
      } else {
        await this.marketplaceConnections.publishFlipkartListing(listing.id);
      }
      this.snackBar.open(`Published to ${marketplaceName}: ₹${listing.sellingPrice || 0}, ${listing.quantity ?? 0} units.`, 'Dismiss', { duration: 4000 });
      void this.wallet.load();
    } catch (error) {
      this.snackBar.open((error instanceof Error && error.message) || 'Failed to publish. Please try again.', 'Dismiss', { duration: 6000 });
    } finally {
      this.publishingListingId.set(null);
    }
  }

  /** Opens the multi-step "find product type -> fill required attributes" flow for creating a
   * brand-new Amazon listing from a manually-added product (one with no `source` yet). That
   * dialog is itself the confirmation: nothing is sent until its final "Create listing" step. */
  /** "Notify me" from the per-product publish menu — recorded once per seller on the server. */
  async notifyPublish(channel: ComingSoonChannel): Promise<void> {
    try {
      await this.features.notifyMe(`${channel}_publish` as NotifyFeature);
      this.snackBar.open(this.i18n.t('We’ll let you know', 'हम आपको बताएंगे'), 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open(this.i18n.t('Couldn’t save — please try again.', 'Save नहीं हुआ — फिर से try करें।'), 'Dismiss', { duration: 4000 });
    }
  }

  openCreateAmazonListingDialog(listing: Listing): void {
    this.dialog
      .open<CreateAmazonListingDialog, Listing, boolean>(CreateAmazonListingDialog, { data: listing, width: '560px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.snackBar.open('Amazon listing created successfully.', 'Dismiss', { duration: 4000 });
        void this.wallet.load();
      });
  }

  /** Opens the full AI listing (every tab) this inventory item was saved from. */
  openFullListing(listing: Listing): void {
    if (listing.draftId) this.router.navigate(['/optimize/general'], { queryParams: { id: listing.draftId } });
  }

  openEditDialog(listing: Listing): void {
    this.dialog
      .open<ProductFormDialog, Listing | null, ProductFormResult | 'open-full-listing'>(ProductFormDialog, { data: listing, maxWidth: '95vw' })
      .afterClosed()
      .subscribe((result) => {
        if (result === 'open-full-listing') {
          this.openFullListing(listing);
          return;
        }
        if (!result || !listing.id) return;
        this.listingService
          .updateListing(listing.id, { ...result, priceINR: `₹${result.sellingPrice}` })
          .then((saved) => {
            this.upsertLocal(saved);
            this.snackBar.open('Product updated successfully.', 'Dismiss', { duration: 3000 });
          })
          .catch((error) => this.snackBar.open((error instanceof Error && error.message) || 'Failed to update product. Please try again.', 'Dismiss', { duration: 4000 }));
      });
  }

  openSaleDialog(listing: Listing): void {
    this.dialog
      .open<LogSaleDialog, Listing, LogSaleResult>(LogSaleDialog, { data: listing, maxWidth: '95vw' })
      .afterClosed()
      .subscribe((result) => {
        if (!result || !listing.id) return;
        // The server reduces stock atomically with the sale and returns the updated listing.
        this.listingService
          .logSale({ listingId: listing.id, platform: result.platform, quantity: result.quantity, salePrice: result.salePrice })
          .then((response) => {
            this.upsertLocal(response.listing ?? { ...listing, quantity: response.stock });
            this.snackBar.open(`Sale logged. Stock: ${response.previousStock} → ${response.stock}`, 'Dismiss', { duration: 4000 });
          })
          .catch((error) => this.snackBar.open((error instanceof Error && error.message) || 'Could not log sale. Please try again.', 'Dismiss', { duration: 5000 }));
      });
  }

  deleteListing(listing: Listing): void {
    if (!listing.id) return;
    if (!confirm(`Remove "${listing.name}" from your inventory? This can't be undone.`)) return;
    this.listingService
      .deleteListing(listing.id)
      .then(() => {
        this.deletedLocal.set(listing.id!, Date.now() + 8000);
        this.recentLocal.delete(listing.id!);
        this.listings.update((list) => list.filter((l) => l.id !== listing.id));
        this.snackBar.open('Listing removed from inventory.', 'Dismiss', { duration: 3000 });
      })
      .catch(() => this.snackBar.open('Failed to delete listing.', 'Dismiss', { duration: 4000 }));
  }
}
