import { Component, ChangeDetectionStrategy, input, output, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { copyOutline, sparkles, checkmark, chevronDown } from 'ionicons/icons';
import { Attribute } from '../../models/category.model';

@Component({
  selector: 'app-attribute-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IonIcon],
  template: `
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">
          {{ attribute().label }}
          @if (attribute().required) {
            <span class="text-red-400">*</span>
          }
        </span>
        <div class="flex items-center gap-2">
          <button type="button" (click)="copy()" class="!p-0 w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-orange-600 flex items-center justify-center" aria-label="Copy field">
            <ion-icon [name]="copied() ? 'checkmark' : 'copy-outline'"></ion-icon>
          </button>
          @if (allowRegenerate()) {
            <button type="button" (click)="regenerate.emit()" [disabled]="regenerating()"
                    class="!p-0 w-7 h-7 rounded-lg bg-slate-950 dark:bg-orange-600 text-white flex items-center justify-center disabled:opacity-40" aria-label="Regenerate with AI">
              <ion-icon name="sparkles" [class.animate-spin]="regenerating()"></ion-icon>
            </button>
          }
        </div>
      </div>

      @if (attribute().type === 'select') {
        <div class="relative">
          <select [ngModel]="draft()" (ngModelChange)="onInput($event)"
                  class="w-full h-12 px-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-slate-100 appearance-none focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500">
            <option value="">Select {{ attribute().label }}</option>
            @for (opt of attribute().options; track opt.value) {
              <option [value]="opt.value">{{ opt.label }}</option>
            }
          </select>
          <ion-icon name="chevron-down" class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"></ion-icon>
        </div>
      } @else {
        <input type="text" [ngModel]="draft()" (ngModelChange)="onInput($event)" [placeholder]="'Enter ' + attribute().label"
               class="w-full h-12 px-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500">
      }
    </div>
  `,
})
export class AttributeCard {
  attribute = input.required<Attribute>();
  value = input('');
  regenerating = input(false);
  allowRegenerate = input(true);

  valueChange = output<string>();
  regenerate = output<void>();

  draft = signal('');
  copied = signal(false);

  constructor() {
    addIcons({ 'copy-outline': copyOutline, sparkles, checkmark, 'chevron-down': chevronDown });
    effect(() => {
      this.draft.set(this.value());
    });
  }

  onInput(v: string) {
    this.draft.set(v);
    this.valueChange.emit(v);
  }

  async copy() {
    await navigator.clipboard.writeText(this.draft());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }
}
