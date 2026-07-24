import { Injectable, signal } from '@angular/core';
import { Marketplace, MarketplaceId } from '../models/marketplace.model';

const MARKETPLACES: Marketplace[] = [
  { id: 'amazon', label: 'Amazon', brandColor: '#FF9900', icon: 'logo-amazon', status: 'live' },
  { id: 'flipkart', label: 'Flipkart', brandColor: '#2874F0', icon: 'bag-handle', status: 'live' },
  { id: 'meesho', label: 'Meesho', brandColor: '#9F2089', icon: 'storefront', status: 'live' },
  { id: 'instagram', label: 'Instagram', brandColor: '#E1306C', icon: 'logo-instagram', status: 'live' },
  { id: 'shopify', label: 'Shopify', brandColor: '#95BF47', icon: 'cart', status: 'comingSoon' },
  { id: 'woocommerce', label: 'WooCommerce', brandColor: '#96588A', icon: 'cube', status: 'comingSoon' },
  { id: 'myntra', label: 'Myntra', brandColor: '#FF3F6C', icon: 'shirt', status: 'comingSoon' },
  { id: 'ajio', label: 'Ajio', brandColor: '#D4145A', icon: 'pricetags', status: 'comingSoon' },
  { id: 'tiktokshop', label: 'TikTok Shop', brandColor: '#000000', icon: 'logo-tiktok', status: 'comingSoon' },
  { id: 'facebook', label: 'Facebook Marketplace', brandColor: '#1877F2', icon: 'logo-facebook', status: 'comingSoon' },
];

@Injectable({ providedIn: 'root' })
export class MarketplaceService {
  private readonly marketplaces = signal<Marketplace[]>(MARKETPLACES);

  all() {
    return this.marketplaces();
  }

  live() {
    return this.marketplaces().filter(m => m.status === 'live');
  }

  comingSoon() {
    return this.marketplaces().filter(m => m.status === 'comingSoon');
  }

  get(id: MarketplaceId): Marketplace | undefined {
    return this.marketplaces().find(m => m.id === id);
  }
}
