import { Injectable, signal, inject } from '@angular/core';
import { ListingService, Listing } from '../../../services/listing';
import { Product } from '../models/product.model';
import { MOCK_PRODUCT } from '../data/mock-product.data';

const AUTOSAVE_DEBOUNCE_MS = 1200;
const HISTORY_LIMIT = 30;

/** Maps the legacy flat Listing/ProductDetails fields onto the new nested Product shape as a starting point. */
function deriveProductFromListing(listing: Listing): Product {
  const base = structuredClone(MOCK_PRODUCT);
  base.id = listing.id;
  base.uid = listing.uid;
  base.createdAt = listing.createdAt;
  base.basicInformation.productName = listing.name || base.basicInformation.productName;
  base.classification.category = listing.category || base.classification.category;
  base.taxation.hsnCode = listing.hsnCode || base.taxation.hsnCode;
  base.taxation.gstPercentage = parseFloat(listing.gstRate) || base.taxation.gstPercentage;
  base.physicalAttributes.material = listing.material || base.physicalAttributes.material;
  base.pricing.sellingPrice = listing.sellingPrice ?? base.pricing.sellingPrice;
  base.pricing.costPrice = listing.costPrice ?? base.pricing.costPrice;
  base.inventory.stockQuantity = listing.quantity ?? base.inventory.stockQuantity;
  base.images.mainImage = listing.processedImage || listing.originalImage || base.images.mainImage;
  return base;
}

/** Route-scoped (provided per ListingWorkspace instance, not root) so state resets per listingId. */
@Injectable()
export class WorkspaceStateService {
  private listingService = inject(ListingService);

  product = signal<Product | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  private listingId: string | null = null;
  private rawListing: Listing | null = null;
  private history: Product[] = [];
  private redoStack: Product[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  async load(listingId: string) {
    this.listingId = listingId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const listing = await this.listingService.getListing(listingId);
      this.rawListing = listing;
      const stored = (listing as unknown as { workspaceProduct?: Product }).workspaceProduct;
      this.product.set(stored ?? deriveProductFromListing(listing));
      this.history = [];
      this.redoStack = [];
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load listing');
    } finally {
      this.loading.set(false);
    }
  }

  update(mutator: (product: Product) => Product) {
    const current = this.product();
    if (!current) return;
    this.history.push(structuredClone(current));
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.redoStack = [];
    this.product.set(mutator(structuredClone(current)));
    this.scheduleAutosave();
  }

  undo() {
    const current = this.product();
    const previous = this.history.pop();
    if (!previous || !current) return;
    this.redoStack.push(current);
    this.product.set(previous);
    this.scheduleAutosave();
  }

  redo() {
    const next = this.redoStack.pop();
    const current = this.product();
    if (!next || !current) return;
    this.history.push(current);
    this.product.set(next);
    this.scheduleAutosave();
  }

  canUndo() {
    return this.history.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  private scheduleAutosave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), AUTOSAVE_DEBOUNCE_MS);
  }

  async save() {
    const current = this.product();
    if (!current || !this.listingId) return;
    this.saving.set(true);
    try {
      await this.listingService.updateListing(this.listingId, { workspaceProduct: current } as Partial<Listing>);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Autosave failed');
    } finally {
      this.saving.set(false);
    }
  }
}
