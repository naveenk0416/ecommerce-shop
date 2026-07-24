import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { download, copyOutline, print, shareSocial, documentOutline, gridOutline, codeSlashOutline } from 'ionicons/icons';

@Component({
  selector: 'app-export-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 flex items-center justify-between shadow-sm hover:shadow-premium transition-all">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-slate-950 dark:bg-orange-600 text-white flex items-center justify-center">
          <ion-icon [name]="icon()" class="text-xl"></ion-icon>
        </div>
        <div>
          <p class="text-sm font-black text-slate-900 dark:text-white">{{ title() }}</p>
          <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400">{{ subtitle() }}</p>
        </div>
      </div>
      <button type="button" (click)="action.emit()" class="btn-icon-premium" [attr.aria-label]="'Export ' + title()">
        <ion-icon [name]="actionIcon()"></ion-icon>
      </button>
    </div>
  `,
})
export class ExportCard {
  title = input('');
  subtitle = input('');
  icon = input('document-outline');
  actionIcon = input<'download' | 'copy-outline' | 'print' | 'share-social'>('download');
  action = output<void>();

  constructor() {
    addIcons({
      download, 'copy-outline': copyOutline, print, 'share-social': shareSocial,
      'document-outline': documentOutline, 'grid-outline': gridOutline, 'code-slash-outline': codeSlashOutline,
    });
  }
}
