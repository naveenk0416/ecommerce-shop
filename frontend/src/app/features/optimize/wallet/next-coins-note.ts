import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { LanguageService } from '../../../services/language';
import { WalletService } from '../../../services/wallet';

/**
 * "Next free coins on 1 Nov (up to 3)" — shown where an AI listing is started (General, Add many)
 * when the seller can't afford one, so 0 coins is never a dead end. Dates are IST.
 */
@Component({
  selector: 'app-next-coins-note',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, RouterLink],
  providers: [DatePipe],
  template: `
    @if (text(); as line) {
      <p class="next-coins" role="status" data-testid="next-free-coins">
        <mat-icon aria-hidden="true">event</mat-icon>
        <span>{{ line }} <a routerLink="/optimize/wallet">{{ i18n.t('Earn more', 'और कमाएं', 'ఇంకా సంపాదించండి', 'ಇನ್ನಷ್ಟು ಗಳಿಸಿ') }}</a></span>
      </p>
    }
  `,
  styles: `
    .next-coins { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 13px; font-weight: 700; color: #9a3412; }
    .next-coins mat-icon { font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; }
    .next-coins a { color: inherit; margin-left: 4px; }
  `,
})
export class NextCoinsNote {
  protected readonly i18n = inject(LanguageService);
  private readonly wallet = inject(WalletService);
  private readonly datePipe = inject(DatePipe);

  readonly text = computed(() => {
    const w = this.wallet.wallet();
    if (!w?.nextTopUpAt) return null;
    const date = this.datePipe.transform(w.nextTopUpAt, 'd MMM', '+0530') ?? '';
    const n = w.monthlyTopUpTo;
    return this.i18n.t(
      `Next free coins on ${date} (up to ${n}).`,
      `अगले free coins ${date} को (${n} तक)।`,
      `తదుపరి free coins ${date} న (${n} వరకు).`,
      `ಮುಂದಿನ free coins ${date} ರಂದು (${n} ವರೆಗೆ).`,
    );
  });
}
