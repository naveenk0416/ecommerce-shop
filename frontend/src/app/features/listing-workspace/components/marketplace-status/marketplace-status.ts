import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, alertCircle, closeCircle } from 'ionicons/icons';

export type MarketplaceStatusKind = 'ready' | 'partial' | 'blocked';

@Component({
  selector: 'app-marketplace-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest" [class]="pillClass()">
      <ion-icon [name]="icon()"></ion-icon>
      {{ text() }}
    </span>
  `,
})
export class MarketplaceStatus {
  status = input<MarketplaceStatusKind>('partial');
  missingCount = input(0);

  text = computed(() => {
    if (this.status() === 'ready') return 'Ready';
    if (this.status() === 'blocked') return this.missingCount() > 0 ? `Missing ${this.missingCount()}` : 'Blocked';
    return this.missingCount() > 0 ? `Missing ${this.missingCount()}` : 'Needs Review';
  });

  icon = computed(() => ({
    ready: 'checkmark-circle',
    partial: 'alert-circle',
    blocked: 'close-circle',
  }[this.status()]));

  pillClass = computed(() => ({
    ready: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    partial: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
    blocked: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  }[this.status()]));

  constructor() {
    addIcons({ 'checkmark-circle': checkmarkCircle, 'alert-circle': alertCircle, 'close-circle': closeCircle });
  }
}
