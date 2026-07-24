import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  downloadOutline, copyOutline, rocketOutline, lockClosedOutline,
  logoAmazon, bagHandle, storefront, logoInstagram, cart, cube, shirt, pricetags, logoTiktok, logoFacebook,
} from 'ionicons/icons';
import { Marketplace } from '../../models/marketplace.model';
import { MarketplaceStatus, MarketplaceStatusKind } from '../marketplace-status/marketplace-status';

@Component({
  selector: 'app-publish-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, MarketplaceStatus],
  template: `
    <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[1.75rem] p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white" [style.background]="marketplace().brandColor">
            <ion-icon [name]="marketplace().icon" class="text-lg"></ion-icon>
          </div>
          <span class="text-sm font-black text-slate-900 dark:text-white">{{ marketplace().label }}</span>
        </div>
        @if (marketplace().status === 'live') {
          <app-marketplace-status [status]="status()" [missingCount]="missingCount()" />
        } @else {
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-400">
            <ion-icon name="lock-closed-outline"></ion-icon>
            Coming Soon
          </span>
        }
      </div>

      @if (marketplace().status === 'live') {
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="downloadExcel.emit()" class="btn-icon-premium !w-auto !h-10 px-4 gap-2 text-[10px]">
            <ion-icon name="download-outline"></ion-icon> Excel
          </button>
          <button type="button" (click)="copyListing.emit()" class="btn-icon-premium !w-auto !h-10 px-4 gap-2 text-[10px]">
            <ion-icon name="copy-outline"></ion-icon> Copy
          </button>
          <button type="button" (click)="publish.emit()" [disabled]="!publishEnabled()"
                  class="!w-auto !h-10 px-4 gap-2 text-[10px] rounded-[15px] flex items-center justify-center font-bold uppercase tracking-widest bg-slate-950 dark:bg-orange-600 text-white disabled:opacity-40 disabled:cursor-not-allowed">
            <ion-icon name="rocket-outline"></ion-icon> Publish
          </button>
        </div>
      }
    </div>
  `,
})
export class PublishCard {
  marketplace = input.required<Marketplace>();
  status = input<MarketplaceStatusKind>('partial');
  missingCount = input(0);
  publishEnabled = input(false);

  downloadExcel = output<void>();
  copyListing = output<void>();
  publish = output<void>();

  constructor() {
    addIcons({
      'download-outline': downloadOutline, 'copy-outline': copyOutline, 'rocket-outline': rocketOutline, 'lock-closed-outline': lockClosedOutline,
      'logo-amazon': logoAmazon, 'bag-handle': bagHandle, storefront, 'logo-instagram': logoInstagram,
      cart, cube, shirt, pricetags, 'logo-tiktok': logoTiktok, 'logo-facebook': logoFacebook,
    });
  }
}
