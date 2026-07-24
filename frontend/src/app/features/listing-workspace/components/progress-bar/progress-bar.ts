import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';

@Component({
  selector: 'app-progress-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full">
      @if (label()) {
        <div class="flex items-center justify-between mb-2">
          <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{{ label() }}</span>
          <span class="text-xs font-black" [class]="textClass()">{{ percent() }}%</span>
        </div>
      }
      <div class="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div class="h-full rounded-full transition-all duration-700" [class]="barClass()" [style.width.%]="percent()"></div>
      </div>
    </div>
  `,
})
export class ProgressBar {
  percent = input(0);
  label = input('');

  severity = computed(() => {
    const v = this.percent();
    if (v >= 80) return 'good';
    if (v >= 50) return 'warn';
    return 'bad';
  });

  barClass = computed(() => ({
    good: 'bg-emerald-500',
    warn: 'bg-orange-500',
    bad: 'bg-red-500',
  }[this.severity()]));

  textClass = computed(() => ({
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-orange-500 dark:text-orange-400',
    bad: 'text-red-500 dark:text-red-400',
  }[this.severity()]));
}
