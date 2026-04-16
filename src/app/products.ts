import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, 
  IonCardContent, IonBadge
} from '@ionic/angular/standalone';
import { Listing } from './services/listing';
import { addIcons } from 'ionicons';
import { 
  cube, search, filter, ellipsisVertical, 
  eye, trash, trendingUp, alertCircle 
} from 'ionicons/icons';

@Component({
  selector: 'app-products',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, 
    IonCardContent, IonBadge
  ],
  templateUrl: './products.html',
  styleUrl: './products.css'
})
export class Products {
  listings = input<Listing[]>([]);
  view = output<Listing>();
  delete = output<string>();

  constructor() {
    addIcons({ cube, search, filter, ellipsisVertical, eye, trash, trendingUp, alertCircle });
  }

  get totalValue(): number {
    return this.listings().reduce((acc, curr) => {
      const price = parseFloat(curr.priceINR.replace(/[^0-9.]/g, '')) || 0;
      return acc + price;
    }, 0);
  }

  get averagePrice(): number {
    if (this.listings().length === 0) return 0;
    return this.totalValue / this.listings().length;
  }
}
