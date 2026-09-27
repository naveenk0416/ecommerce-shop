import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { LanguageService } from '../../../services/language';
import { WalletService } from '../../../services/wallet';
import { CoinPacks, EarnCoinsCard } from './wallet-ui';

/**
 * Shown when an AI listing is refused for lack of coins: when the free coins come back, the
 * bonuses still to earn, the referral link, and (if packs are on) the packs — starter offer first.
 */
@Component({
  selector: 'app-out-of-coins-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, MatButtonModule, MatDialogModule, MatIconModule, EarnCoinsCard, CoinPacks],
  template: `
    <h2 mat-dialog-title>{{ i18n.t('You\\'re out of coins', 'आपके coins खत्म हो गए हैं') }}</h2>
    <mat-dialog-content class="ooc">
      @if (walletService.wallet(); as w) {
        <p class="ooc__lead">
          <mat-icon aria-hidden="true">event</mat-icon>
          <span>
            {{ i18n.t('Next free top-up: up to ' + w.monthlyTopUpTo + ' coins on', 'अगला free top-up: ' + w.monthlyTopUpTo + ' coins तक, तारीख') }}
            <strong>{{ w.nextTopUpAt | date: 'd MMM y' : '+0530' }}</strong>.
            {{ i18n.t('Or earn coins now:', 'या अभी coins कमाएं:') }}
          </span>
        </p>
        @if (w.packs.enabled) {
          <app-coin-packs [wallet]="w" />
        }
        <app-earn-coins-card [wallet]="w" [pendingOnly]="true" />
        @if (!w.packs.enabled) {
          <app-coin-packs [wallet]="w" />
        }
      } @else {
        <p role="status">{{ i18n.t('Loading…', 'Load हो रहा है…') }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <a mat-button routerLink="/optimize/wallet" (click)="close()">{{ i18n.t('Open Coins page', 'Coins page खोलें') }}</a>
      <button mat-flat-button color="primary" (click)="close()">{{ i18n.t('Close', 'बंद करें') }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .ooc { display: flex; flex-direction: column; gap: 16px; }
    .ooc__lead { margin: 0; display: flex; gap: 8px; align-items: flex-start; font-size: 14px; color: #334155; }
    .ooc__lead mat-icon { color: #ea580c; flex-shrink: 0; }
  `,
})
export class OutOfCoinsDialog {
  readonly i18n = inject(LanguageService);
  readonly walletService = inject(WalletService);
  private readonly dialogRef = inject(MatDialogRef<OutOfCoinsDialog>);

  constructor() {
    void this.walletService.load();
  }

  close(): void {
    this.dialogRef.close();
  }
}
