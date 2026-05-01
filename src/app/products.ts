import { Component, input, output, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonButton, IonIcon, IonModal, IonBadge, IonLabel, IonSpinner, IonRange, IonSegment, IonSegmentButton, IonInput, IonTextarea
} from '@ionic/angular/standalone';
import { Listing } from './services/listing';
import { AuthService } from './services/auth';
import { addIcons } from 'ionicons';
import { 
  cube, search, filter, ellipsisVertical, 
  eye, trash, trendingUp, alertCircle, add,
  pricetag, statsChart, chevronDown, close,
  save, list
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
  listings = input<Listing[]>([]);
  view = output<Listing>();
  delete = output<string>();
  addManual = output<Partial<Listing>>();
  searchQuery = signal<string>('');

  constructor() {
    addIcons({ 
      cube, search, filter, ellipsisVertical, eye, trash, 
      trendingUp, alertCircle, add, pricetag, statsChart,
      chevronDown, close, save, list
    });
  }

  isAddModalOpen = signal(false);
  newProduct = signal<Partial<Listing>>({
    name: '',
    category: '',
    quantity: 1,
    costPrice: '',
    sellingPrice: '',
    description: '',
    priceINR: '0',
    gstRate: '12%',
    hsnCode: '',
    material: '',
    variations: [],
    platformContent: {}
  });

  openAddModal() {
    this.resetNewProduct();
    this.isAddModalOpen.set(true);
  }

  closeAddModal() {
    this.isAddModalOpen.set(false);
  }

  resetNewProduct() {
    this.newProduct.set({
      name: '',
      category: '',
      quantity: 1,
      costPrice: '',
      sellingPrice: '',
      description: '',
      priceINR: '0',
      gstRate: '18%',
      hsnCode: '',
      material: '',
      variations: [],
      platformContent: {}
    });
  }

  submitManualProduct() {
    const product = this.newProduct();
    if (!product.name || !product.sellingPrice) return;
    
    // Auto-fill priceINR for consistency with existing data
    product.priceINR = `₹${product.sellingPrice}`;
    
    this.addManual.emit(product);
    this.closeAddModal();
  }

  parsePrice(price: unknown): number {
    if (!price) return 0;
    if (typeof price === 'number') return price;
    const cleaned = String(price).replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  }

  get totalValue(): number {
    return this.listings().reduce((acc, curr) => {
      return acc + (this.parsePrice(curr.priceINR) * (curr.quantity || 1));
    }, 0);
  }

  get averagePrice(): number {
    const totalQty = this.listings().reduce((acc, curr) => acc + (curr.quantity || 1), 0);
    if (totalQty === 0) return 0;
    return this.totalValue / totalQty;
  }

  get filteredListings(): Listing[] {
    const query = this.searchQuery().toLowerCase();
    if (!query) return this.listings();
    return this.listings().filter(l => 
      l.name.toLowerCase().includes(query) || 
      (l.category || '').toLowerCase().includes(query) ||
      (l.hsnCode || '').toLowerCase().includes(query)
    );
  }
}
