import { Component, input, output, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonIcon, IonModal, ToastController
} from '@ionic/angular/standalone';
import { Listing, ListingService, Sale } from './services/listing';
import { AuthService } from './services/auth';
import { parsePrice } from './utils/price';
import { addIcons } from 'ionicons';
import {
  cube, cubeOutline, search, refresh,
  eye, trash, alertCircle, add,
  pricetag, barcodeOutline, chevronDown, close,
  save, list, cart, paperPlane
} from 'ionicons/icons';

@Component({
  selector: 'app-products',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    IonIcon, IonModal
  ],
  templateUrl: './products.html',
  styleUrl: './products.css'
})
export class Products {
  public auth = inject(AuthService);
  private listingService = inject(ListingService);
  private toastController = inject(ToastController, { optional: true });

  listings = input<Listing[]>([]);
  view = output<Listing>();
  delete = output<string>();
  addManual = output<Partial<Listing>>();
  refresh = output<void>();
  searchQuery = '';

  constructor() {
    addIcons({
      cube, cubeOutline, search, refresh, eye, trash,
      alertCircle, add, pricetag, barcodeOutline,
      chevronDown, close, save, list, cart, paperPlane
    });
  }

  isAddModalOpen = signal(false);
  isSaleModalOpen = signal(false);
  selectedListingForSale = signal<Listing | null>(null);

  newProduct: Partial<Listing> = {
    name: '',
    category: '',
    quantity: 1,
    costPrice: 0,
    sellingPrice: 0,
    description: '',
    priceINR: '0',
    gstRate: '18%',
    hsnCode: '',
    material: '',
    variations: [],
    platformContent: {}
  };

  saleData: Omit<Sale, 'id' | 'uid' | 'date'> = {
    listingId: '',
    platform: 'Amazon',
    quantity: 1,
    salePrice: 0
  };

  openAddModal() {
    this.resetNewProduct();
    this.isAddModalOpen.set(true);
  }

  closeAddModal() {
    this.isAddModalOpen.set(false);
  }

  openSaleModal(listing: Listing) {
    this.selectedListingForSale.set(listing);
    this.saleData = {
      listingId: listing.id!,
      platform: 'Amazon',
      quantity: 1,
      salePrice: listing.sellingPrice || this.parsePrice(listing.priceINR)
    };
    this.isSaleModalOpen.set(true);
  }

  closeSaleModal() {
    this.isSaleModalOpen.set(false);
    this.selectedListingForSale.set(null);
  }

  /** Stock available for the listing currently selected in the sale modal. */
  availableStock(): number {
    return Number(this.selectedListingForSale()?.quantity ?? 0);
  }

  async submitSale() {
    const data = this.saleData;
    const listing = this.selectedListingForSale();
    if (!data.listingId || Number(data.quantity) <= 0 || !listing) return;

    // Ensure numeric types for API validation
    const submissionData = {
      ...data,
      quantity: Number(data.quantity),
      salePrice: Number(data.salePrice) || 0
    };

    if (submissionData.quantity > this.availableStock()) {
      const toast = await this.toastController?.create?.({
        message: `Only ${this.availableStock()} units in stock — you can't sell ${submissionData.quantity}.`,
        duration: 3000,
        color: 'warning'
      });
      if (toast) await toast.present();
      return;
    }

    try {
      await this.listingService.logSale(submissionData);
      
      // Decrement inventory quantity
      const currentQty = Number(listing.quantity ?? 0);
      const newQty = Math.max(0, currentQty - submissionData.quantity);
      await this.listingService.updateListing(data.listingId, { quantity: newQty });

      const toast = await this.toastController?.create?.({
        message: `Sale logged! Inventory updated to ${newQty} units.`,
        duration: 2000,
        color: 'success'
      });
      if (toast) await toast.present();
      this.closeSaleModal();
    } catch (error) {
      console.error('Failed to log sale:', error);
      const toast = await this.toastController?.create?.({
        message: 'Could not log sale. Please check your permissions and data.',
        duration: 3000,
        color: 'danger'
      });
      if (toast) await toast.present();
    }
  }

  resetNewProduct() {
    this.newProduct = {
      name: '',
      category: '',
      quantity: 1,
      costPrice: 0,
      sellingPrice: 0,
      description: '',
      priceINR: '0',
      gstRate: '18%',
      hsnCode: '',
      material: '',
      variations: [],
      platformContent: {}
    };
  }

  submitManualProduct() {
    const product = this.newProduct;
    const sellingPrice = Number(product.sellingPrice) || 0;
    if (!product.name || sellingPrice <= 0) return;
    
    // Auto-fill priceINR for consistency with existing data
    product.priceINR = `₹${sellingPrice}`;

    // Ensure numeric types (cleared inputs come through as null/'' → NaN)
    product.quantity = Number(product.quantity) || 0;
    product.costPrice = Number(product.costPrice) || 0;
    product.sellingPrice = sellingPrice;

    this.addManual.emit(product);
    this.closeAddModal();
  }

  parsePrice(price: string | number | undefined | null): number {
    return parsePrice(price);
  }

  getProfit(listing: Listing): number {
    const sell = listing.sellingPrice || this.parsePrice(listing.priceINR);
    const cost = listing.costPrice || 0;
    if (cost === 0) return 0;
    return (sell - cost) * (listing.quantity ?? 0);
  }

  get totalValue(): number {
    return this.listings().reduce((acc, curr) => {
      return acc + (this.parsePrice(curr.priceINR) * (curr.quantity ?? 0));
    }, 0);
  }

  get totalProfit(): number {
    return this.listings().reduce((acc, curr) => {
      return acc + this.getProfit(curr);
    }, 0);
  }

  get lowStockCount(): number {
    return this.listings().filter(l => (l.quantity ?? 0) < 5).length;
  }

  isLowStock(listing: Listing): boolean {
    return (listing.quantity ?? 0) < 5;
  }

  get averagePrice(): number {
    const totalQty = this.listings().reduce((acc, curr) => acc + (curr.quantity ?? 0), 0);
    if (totalQty === 0) return 0;
    return this.totalValue / totalQty;
  }

  get filteredListings(): Listing[] {
    const query = this.searchQuery.toLowerCase();
    const all = this.listings();
    
    // Deduplicate listings by ID to prevent NG0955
    const unique = Array.from(new Map(all.map(item => [item.id, item])).values());
    
    if (!query) return unique;
    return unique.filter(l => 
      l.name.toLowerCase().includes(query) || 
      (l.category || '').toLowerCase().includes(query) ||
      (l.hsnCode || '').toLowerCase().includes(query)
    );
  }
}
