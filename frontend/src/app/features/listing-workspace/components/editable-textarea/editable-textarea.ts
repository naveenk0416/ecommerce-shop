import { Component, ChangeDetectionStrategy, input, output, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { copyOutline, sparkles, checkmark } from 'ionicons/icons';

@Component({
  selector: 'app-editable-textarea',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IonIcon],
  template: `
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">{{ label() }}</span>
        <div class="flex items-center gap-2">
          @if (maxLength()) {
            <span class="text-[9px] font-bold" [class.text-red-500]="draft().length > maxLength()!" [class.text-slate-300]="draft().length <= maxLength()!">
              {{ draft().length }}/{{ maxLength() }}
            </span>
          } @else {
            <span class="text-[9px] font-bold text-slate-300">{{ draft().length }} chars</span>
          }
          <button type="button" (click)="copy()" class="!p-0 w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-orange-600 flex items-center justify-center" aria-label="Copy field">
            <ion-icon [name]="copied() ? 'checkmark' : 'copy-outline'"></ion-icon>
          </button>
          <button type="button" (click)="regenerate.emit()" [disabled]="regenerating()"
                  class="!p-0 w-7 h-7 rounded-lg bg-slate-950 dark:bg-orange-600 text-white flex items-center justify-center disabled:opacity-40" aria-label="Regenerate with AI">
            <ion-icon name="sparkles" [class.animate-spin]="regenerating()"></ion-icon>
          </button>
        </div>
      </div>
      <textarea [ngModel]="draft()" (ngModelChange)="onInput($event)" [rows]="rows()"
                class="w-full p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 transition-all resize-none"></textarea>
    </div>
  `,
})
export class EditableTextArea {
  label = input('');
  value = input('');
  maxLength = input<number | null>(null);
  regenerating = input(false);
  rows = input(3);

  valueChange = output<string>();
  regenerate = output<void>();

  draft = signal('');
  copied = signal(false);

  constructor() {
    addIcons({ 'copy-outline': copyOutline, sparkles, checkmark });
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
