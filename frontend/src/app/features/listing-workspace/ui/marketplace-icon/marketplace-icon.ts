import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type MarketplaceId =
  | 'general'
  | 'amazon'
  | 'flipkart'
  | 'meesho'
  | 'instagram'
  | 'insights'
  | 'readiness'
  | 'publish'
  | 'export';

interface MarketplaceIconMeta {
  icon: string;
  color: string;
}

const MARKETPLACE_ICON_MAP: Record<MarketplaceId, MarketplaceIconMeta> = {
  general: { icon: 'inventory_2', color: '#0f172a' },
  amazon: { icon: 'shopping_bag', color: '#f97316' },
  flipkart: { icon: 'storefront', color: '#2563eb' },
  meesho: { icon: 'diversity_3', color: '#db2777' },
  instagram: { icon: 'photo_camera', color: '#9333ea' },
  insights: { icon: 'auto_awesome', color: '#7c3aed' },
  readiness: { icon: 'fact_check', color: '#16a34a' },
  publish: { icon: 'publish', color: '#0891b2' },
  export: { icon: 'ios_share', color: '#475569' },
};

@Component({
  selector: 'app-marketplace-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <span class="marketplace-icon" [style.color]="meta().color">
      <mat-icon [style.font-size.px]="size()" [style.width.px]="size()" [style.height.px]="size()">{{ meta().icon }}</mat-icon>
    </span>
  `,
  styles: [
    `
      .marketplace-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
    `,
  ],
})
export class MarketplaceIcon {
  marketplace = input.required<MarketplaceId>();
  size = input(20);

  meta = computed(() => MARKETPLACE_ICON_MAP[this.marketplace()]);
}
