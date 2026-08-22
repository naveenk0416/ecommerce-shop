import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, effect, inject, runInInjectionContext, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UiCard } from '../../listing-workspace/ui/card/card';
import { AuthService } from '../../../services/auth';
import { Listing, ListingService } from '../../../services/listing';
import { MarketplaceConnectionsService } from '../../../services/marketplace-connections';
import { parsePrice } from '../../../utils/price';
import { ProductFormDialog, ProductFormResult } from './product-form-dialog';
import { LogSaleDialog, LogSaleResult } from './log-sale-dialog';

const LOW_STOCK_THRESHOLD = 5;

@Component({
  selector: 'app-optimize-inventory',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DecimalPipe, MatButtonModule, MatIconModule, MatTooltipModule, UiCard],
  templateUrl: './optimize-inventory.html',
  styleUrl: './optimize-inventory.scss',
})
export class OptimizeInventory {
  protected readonly auth = inject(AuthService);
  private readonly listingService = inject(ListingService);
  private readonly marketplaceConnections = inject(MarketplaceConnectionsService);
  private readonly injector = inject(Injector);

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

  filteredListings = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const unique = Array.from(new Map(this.listings().map((item) => [item.id, item])).values());
    if (!query) return unique;
    return unique.filter(
      (l) =>
        l.name.toLowerCase().includes(query) ||
        (l.category || '').toLowerCase().includes(query) ||
        (l.hsnCode || '').toLowerCase().includes(query),
    );
  });

  totalValue = computed(() => this.listings().reduce((sum, l) => sum + parsePrice(l.priceINR) * (l.quantity ?? 0), 0));
  totalProfit = computed(() => this.listings().reduce((sum, l) => sum + this.getProfit(l), 0));
  lowStockCount = computed(() => this.listings().filter((l) => (l.quantity ?? 0) < LOW_STOCK_THRESHOLD).length);
  averagePrice = computed(() => {
    const totalQty = this.listings().reduce((sum, l) => sum + (l.quantity ?? 0), 0);
    return totalQty === 0 ? 0 : this.totalValue() / totalQty;
  });

  constructor() {
    effect((onCleanup) => {
      const user = this.auth.user();
      if (!user) {
        this.listings.set([]);
        return;
      }
      const stop = this.auth.isAdmin()
        ? this.listingService.getAllListings((listings) => this.listings.set(listings))
        : this.listingService.getListings(user.uid, (listings) => this.listings.set(listings));
      onCleanup(() => stop());
    });
  }

  /** Pulls the seller's Amazon catalog into Inventory — the polling subscription set up in the
   * constructor picks up the new/updated rows automatically, no manual refetch needed here. */
  async syncAmazon(): Promise<void> {
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

  /** Pulls the seller's Flipkart catalog into Inventory. */
  async syncFlipkart(): Promise<void> {
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

  isLowStock(listing: Listing): boolean {
    return (listing.quantity ?? 0) < LOW_STOCK_THRESHOLD;
  }

  getProfit(listing: Listing): number {
    const sell = listing.sellingPrice || parsePrice(listing.priceINR);
    const cost = listing.costPrice || 0;
    if (!cost) return 0;
    return (sell - cost) * (listing.quantity ?? 0);
  }

  openAddDialog(): void {
    this.dialog
      .open<ProductFormDialog, Listing | null, ProductFormResult>(ProductFormDialog, { data: null })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.listingService
          .saveListing({ ...result, priceINR: `₹${result.sellingPrice}`, material: '', variations: [], platformContent: {} })
          .then(() => this.snackBar.open('Product added successfully.', 'Dismiss', { duration: 3000 }))
          .catch(() => this.snackBar.open('Failed to add product. Please try again.', 'Dismiss', { duration: 4000 }));
      });
  }

  openEditDialog(listing: Listing): void {
    this.dialog
      .open<ProductFormDialog, Listing | null, ProductFormResult>(ProductFormDialog, { data: listing })
      .afterClosed()
      .subscribe((result) => {
        if (!result || !listing.id) return;
        this.listingService
          .updateListing(listing.id, { ...result, priceINR: `₹${result.sellingPrice}` })
          .then(() => this.snackBar.open('Product updated successfully.', 'Dismiss', { duration: 3000 }))
          .catch(() => this.snackBar.open('Failed to update product. Please try again.', 'Dismiss', { duration: 4000 }));
      });
  }

  openSaleDialog(listing: Listing): void {
    this.dialog
      .open<LogSaleDialog, Listing, LogSaleResult>(LogSaleDialog, { data: listing })
      .afterClosed()
      .subscribe((result) => {
        if (!result || !listing.id) return;
        this.listingService
          .logSale({ listingId: listing.id, platform: result.platform, quantity: result.quantity, salePrice: result.salePrice })
          .then(() => {
            const newQty = Math.max(0, (listing.quantity ?? 0) - result.quantity);
            return this.listingService.updateListing(listing.id!, { quantity: newQty });
          })
          .then(() => this.snackBar.open('Sale logged and inventory updated.', 'Dismiss', { duration: 3000 }))
          .catch(() => this.snackBar.open('Could not log sale. Please try again.', 'Dismiss', { duration: 4000 }));
      });
  }

  deleteListing(listing: Listing): void {
    if (!listing.id) return;
    if (!confirm(`Remove "${listing.name}" from your inventory? This can't be undone.`)) return;
    this.listingService
      .deleteListing(listing.id)
      .then(() => this.snackBar.open('Listing removed from inventory.', 'Dismiss', { duration: 3000 }))
      .catch(() => this.snackBar.open('Failed to delete listing.', 'Dismiss', { duration: 4000 }));
  }
}
