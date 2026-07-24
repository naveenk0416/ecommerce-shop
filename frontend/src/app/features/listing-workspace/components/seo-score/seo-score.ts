import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';

@Component({
  selector: 'app-seo-score',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-4">
      <div class="relative w-20 h-20 flex-shrink-0">
        <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" class="stroke-slate-100 dark:stroke-slate-800" stroke-width="3"></circle>
          <circle cx="18" cy="18" r="15.5" fill="none" [class]="ringClass()" stroke-width="3" stroke-linecap="round"
                  [attr.stroke-dasharray]="circumference" [attr.stroke-dashoffset]="dashOffset()"></circle>
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-lg font-black font-display" [class]="textClass()">{{ score() }}</span>
        </div>
      </div>
      <div>
        <p class="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{{ label() }}</p>
        <p class="text-xs font-bold mt-1" [class]="textClass()">{{ qualitative() }}</p>
      </div>
    </div>
  `,
})
export class SEOScore {
  score = input(0);
  label = input('SEO Score');
  circumference = 2 * Math.PI * 15.5;

  dashOffset = computed(() => this.circumference * (1 - this.score() / 100));

  severity = computed(() => {
    const v = this.score();
    if (v >= 80) return 'good';
    if (v >= 50) return 'warn';
    return 'bad';
  });

  qualitative = computed(() => ({ good: 'Excellent', warn: 'Needs Work', bad: 'Poor' }[this.severity()]));
  textClass = computed(() => ({
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-orange-500 dark:text-orange-400',
    bad: 'text-red-500 dark:text-red-400',
  }[this.severity()]));
  ringClass = computed(() => ({
    good: 'stroke-emerald-500',
    warn: 'stroke-orange-500',
    bad: 'stroke-red-500',
  }[this.severity()]));
}
