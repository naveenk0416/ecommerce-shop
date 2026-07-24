import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trendingUp, trendingDown, remove } from 'ionicons/icons';

@Component({
  selector: 'app-score-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[1.75rem] p-6 shadow-sm transition-all hover:shadow-premium hover:-translate-y-0.5">
      <div class="flex items-center justify-between mb-3">
        <span class="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{{ label() }}</span>
        <ion-icon [name]="trendIcon()" class="text-sm" [class]="severityClass()"></ion-icon>
      </div>
      <div class="flex items-baseline gap-1">
        <span class="text-3xl font-black tracking-tighter font-display" [class]="severityClass()">{{ value() }}</span>
        <span class="text-sm font-bold text-slate-300 dark:text-slate-600">{{ suffix() }}</span>
      </div>
    </div>
  `,
})
export class ScoreCard {
  label = input('');
  value = input(0);
  suffix = input('%');

  severity = computed(() => {
    const v = this.value();
    if (v >= 80) return 'good';
    if (v >= 50) return 'warn';
    return 'bad';
  });

  severityClass = computed(() => ({
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-orange-500 dark:text-orange-400',
    bad: 'text-red-500 dark:text-red-400',
  }[this.severity()]));

  trendIcon = computed(() => ({
    good: 'trending-up',
    warn: 'remove',
    bad: 'trending-down',
  }[this.severity()]));

  constructor() {
    addIcons({ 'trending-up': trendingUp, 'trending-down': trendingDown, remove });
  }
}
