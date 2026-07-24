import { Component, ChangeDetectionStrategy, input, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  documentTextOutline, logoAmazon, bagHandle, storefront, logoInstagram,
  analyticsOutline, shieldCheckmarkOutline, rocketOutline, downloadOutline,
  moon, sunny, arrowBack,
} from 'ionicons/icons';
import { ThemeService } from '../../services/theme.service';

export interface WorkspaceTabLink {
  path: string;
  label: string;
  icon: string;
}

export const WORKSPACE_TABS: WorkspaceTabLink[] = [
  { path: 'general', label: 'General Details', icon: 'document-text-outline' },
  { path: 'amazon', label: 'Amazon', icon: 'logo-amazon' },
  { path: 'flipkart', label: 'Flipkart', icon: 'bag-handle' },
  { path: 'meesho', label: 'Meesho', icon: 'storefront' },
  { path: 'instagram', label: 'Instagram', icon: 'logo-instagram' },
  { path: 'insights', label: 'AI Insights', icon: 'analytics-outline' },
  { path: 'readiness', label: 'Marketplace Readiness', icon: 'shield-checkmark-outline' },
  { path: 'publish', label: 'Publish Center', icon: 'rocket-outline' },
  { path: 'export', label: 'Export Center', icon: 'download-outline' },
];

@Component({
  selector: 'app-marketplace-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IonIcon],
  templateUrl: './marketplace-header.html',
})
export class MarketplaceHeader {
  theme = inject(ThemeService);

  productName = input('');
  sku = input('');
  tabs = WORKSPACE_TABS;

  constructor() {
    addIcons({
      'document-text-outline': documentTextOutline, 'logo-amazon': logoAmazon, 'bag-handle': bagHandle,
      storefront, 'logo-instagram': logoInstagram, 'analytics-outline': analyticsOutline,
      'shield-checkmark-outline': shieldCheckmarkOutline, 'rocket-outline': rocketOutline,
      'download-outline': downloadOutline, moon, sunny, 'arrow-back': arrowBack,
    });
  }
}
