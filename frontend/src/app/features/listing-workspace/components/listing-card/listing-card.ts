import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-listing-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm">
      <div class="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex-shrink-0">
        @if (imageUrl()) {
          <img [src]="imageUrl()" [alt]="name()" class="w-full h-full object-cover">
        }
      </div>
      <div class="min-w-0">
        <p class="text-sm font-bold text-slate-900 dark:text-white truncate">{{ name() || 'Untitled Product' }}</p>
        <div class="flex items-center gap-2 mt-1">
          <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">{{ sku() }}</span>
          @if (price()) {
            <span class="text-xs font-black text-orange-600 dark:text-orange-400">₹{{ price() | number }}</span>
          }
        </div>
      </div>
    </div>
  `,
  imports: [DecimalPipe],
})
export class ListingCard {
  name = input('');
  imageUrl = input('');
  sku = input('');
  price = input(0);
}
