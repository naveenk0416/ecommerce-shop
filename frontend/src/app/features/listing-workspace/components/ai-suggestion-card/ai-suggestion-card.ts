import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { bulb, checkmark, close } from 'ionicons/icons';

@Component({
  selector: 'app-ai-suggestion-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <div class="flex items-start gap-4 p-5 bg-orange-50/60 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 rounded-2xl">
      <div class="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center flex-shrink-0">
        <ion-icon name="bulb" class="text-lg"></ion-icon>
      </div>
      <p class="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed">{{ suggestion() }}</p>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button type="button" (click)="apply.emit()" class="!p-0 w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600" aria-label="Apply suggestion">
          <ion-icon name="checkmark" class="text-sm"></ion-icon>
        </button>
        <button type="button" (click)="dismiss.emit()" class="!p-0 w-8 h-8 rounded-lg bg-white dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:text-red-500" aria-label="Dismiss suggestion">
          <ion-icon name="close" class="text-sm"></ion-icon>
        </button>
      </div>
    </div>
  `,
})
export class AISuggestionCard {
  suggestion = input('');
  apply = output<void>();
  dismiss = output<void>();

  constructor() {
    addIcons({ bulb, checkmark, close });
  }
}
