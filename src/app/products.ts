import { Component, input, output, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonButton, IonIcon, IonModal, IonBadge, IonLabel, IonSpinner, IonRange, IonSegment, IonSegmentButton, IonInput, IonTextarea, ToastController
} from '@ionic/angular/standalone';
import { Listing, ListingService, Sale } from './services/listing';
import { AuthService } from './services/auth';
import { addIcons } from 'ionicons';
import { 
  cube, search, filter, ellipsisVertical, 
  eye, trash, trendingUp, alertCircle, add,
  pricetag, statsChart, chevronDown, close,
  save, list, cart, storefront, paperPlane, logoInstagram
} from 'ionicons/icons';

@Component({
  selector: 'app-products',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    IonButton, IonIcon, IonModal, IonBadge, IonLabel, IonSpinner, IonRange, IonSegment, IonSegmentButton, IonInput, IonTextarea
  ],
  templateUrl: './products.html',
  styleUrl: './products.css'
})
export class Products {
  public auth = inject(AuthService);
  private listingService = inject(ListingService);
  private toastController = inject(ToastController);

  listings = input<Listing[]>([]);
  view = output<Listing>();
  delete = output<string>();
  addManual = output<Partial<Listing>>();
  searchQuery = '';

  constructor() {
    addIcons({ 
      cube, search, filter, ellipsisVertical, eye, trash, 
      trendingUp, alertCircle, add, pricetag, statsChart,
      chevronDown, close, save, list, cart, storefront,
      paperPlane, logoInstagram
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
    gstRate: '12%',
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

  async submitSale() {
    const data = this.saleData;
    const listing = this.selectedListingForSale();
    if (!data.listingId || Number(data.quantity) <= 0 || !listing) return;

    // Ensure numeric types for Firestore rules validation
    const submissionData = {
      ...data,
      quantity: Number(data.quantity),
      salePrice: Number(data.salePrice)
    };

    try {
      await this.listingService.logSale(submissionData);
      
      // Decrement inventory quantity
      const currentQty = Number(listing.quantity) || 1;
      const newQty = Math.max(0, currentQty - submissionData.quantity);
      await this.listingService.updateListing(data.listingId, { quantity: newQty });

      const toast = await this.toastController.create({
        message: `Sale logged! Inventory updated to ${newQty} units.`,
        duration: 2000,
        color: 'success'
      });
      await toast.present();
      this.closeSaleModal();
    } catch (error) {
      console.error('Failed to log sale:', error);
      const toast = await this.toastController.create({
        message: 'Could not log sale. Please check your permissions and data.',
        duration: 3000,
        color: 'danger'
      });
      await toast.present();
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

    // Ensure numeric types
    product.quantity = Number(product.quantity);
    product.costPrice = Number(product.costPrice);
    product.sellingPrice = Number(product.sellingPrice);
    
    this.addManual.emit(product);
    this.closeAddModal();
  }

  parsePrice(price: string | number | undefined | null): number {
    if (price === undefined || price === null) return 0;
    if (typeof price === 'number') return price;
    const cleaned = String(price).replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  }

  getProfit(listing: Listing): number {
    const sell = listing.sellingPrice || this.parsePrice(listing.priceINR);
    const cost = listing.costPrice || 0;
    if (cost === 0) return 0;
    return (sell - cost) * (listing.quantity || 1);
  }

  get totalValue(): number {
    return this.listings().reduce((acc, curr) => {
      return acc + (this.parsePrice(curr.priceINR) * (curr.quantity || 1));
    }, 0);
  }

  get totalProfit(): number {
    return this.listings().reduce((acc, curr) => {
      return acc + this.getProfit(curr);
    }, 0);
  }

  get lowStockCount(): number {
    return this.listings().filter(l => (l.quantity || 0) < 5).length;
  }

  isLowStock(listing: Listing): boolean {
    return (listing.quantity || 0) < 5;
  }

  get averagePrice(): number {
    const totalQty = this.listings().reduce((acc, curr) => acc + (curr.quantity || 1), 0);
    if (totalQty === 0) return 0;
    return this.totalValue / totalQty;
  }

  get filteredListings(): Listing[] {
    const query = this.searchQuery.toLowerCase();
    if (!query) return this.listings();
    return this.listings().filter(l => 
      l.name.toLowerCase().includes(query) || 
      (l.category || '').toLowerCase().includes(query) ||
      (l.hsnCode || '').toLowerCase().includes(query)
    );
  }
}
