import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, add } from 'ionicons/icons';

@Component({
  selector: 'app-keyword-chips',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IonIcon],
  template: `
    <div>
      @if (label()) {
        <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-2">{{ label() }}</span>
      }
      <div class="flex flex-wrap gap-2 items-center">
        @for (kw of values(); track kw; let i = $index) {
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full text-[11px] font-bold text-slate-700 dark:text-slate-200">
            {{ kw }}
            <button type="button" (click)="remove(i)" class="!p-0 !bg-transparent text-slate-400 hover:text-red-500" aria-label="Remove keyword">
              <ion-icon name="close" class="text-xs"></ion-icon>
            </button>
          </span>
        }
        <div class="inline-flex items-center gap-1">
          <input type="text" [(ngModel)]="draft" (keydown.enter)="add()" placeholder="Add..."
                 class="w-24 h-8 px-2 text-[11px] font-bold bg-transparent border border-dashed border-slate-300 dark:border-slate-700 rounded-full focus:outline-none focus:border-orange-500">
          <button type="button" (click)="add()" class="!p-0 w-8 h-8 !bg-slate-900 dark:!bg-orange-600 text-white rounded-full flex items-center justify-center" aria-label="Add keyword">
            <ion-icon name="add" class="text-sm"></ion-icon>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class KeywordChips {
  label = input('');
  values = input<string[]>([]);
  valuesChange = output<string[]>();
  draft = '';

  constructor() {
    addIcons({ close, add });
  }

  add() {
    const v = this.draft.trim();
    if (!v) return;
    this.valuesChange.emit([...this.values(), v]);
    this.draft = '';
  }

  remove(index: number) {
    this.valuesChange.emit(this.values().filter((_, i) => i !== index));
  }
}
