import { ChangeDetectionStrategy, Component, inject, input, model, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LanguageService } from '../../../services/language';
import { MARKETPLACE_OPTIONS, MARKETPLACE_OTHER_MAX, toggleMarketplace } from '../../../config/signup-options';

/**
 * "Where do you sell? (select all)" chips — used in the onboarding card, the one-time dashboard
 * card and Profile → My marketplaces. "Not selling yet" and the other chips exclude each other;
 * "Other" opens a small text box (max 30 characters). Saving is up to the parent.
 */
@Component({
  selector: 'app-marketplace-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <fieldset class="mp" [attr.lang]="i18n.lang()" data-testid="marketplace-picker">
      <legend class="mp__legend">
        <span>{{ t('Where do you sell? (select all)', 'आप कहाँ बेचते हैं? (सभी चुनें)') }}</span>
        @if (skippable()) {
          <button type="button" class="mp__skip" (click)="skip.emit()" data-testid="marketplaces-skip">{{ t('Skip', 'छोड़ें') }}</button>
        }
      </legend>
      <div class="mp__chips">
        @for (o of options; track o.value) {
          <label class="mp__chip" [class.mp__chip--on]="selected().includes(o.value)" [attr.data-testid]="'mp-' + o.value">
            <input type="checkbox" [checked]="selected().includes(o.value)" (change)="toggle(o.value, $any($event.target).checked)" />
            <mat-icon aria-hidden="true" [style.color]="o.color">{{ o.icon }}</mat-icon>
            {{ i18n.lang() === 'hi' ? o.hi : o.en }}
          </label>
        }
      </div>
      @if (selected().includes('other')) {
        <input class="mp__other" type="text" [attr.maxlength]="otherMax" [value]="other()" (input)="other.set($any($event.target).value)"
          [placeholder]="t('Which one? e.g. GlowRoad', 'कौन सा? जैसे GlowRoad')" [attr.aria-label]="t('Other marketplace', 'अन्य marketplace')" data-testid="mp-other-text" />
      }
    </fieldset>
  `,
  styles: `
    :host { display: block; }
    .mp { margin: 0; padding: 0; border: 0; min-width: 0; }
    .mp__legend { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; margin-bottom: 6px; font-size: 13px; font-weight: 800; color: #334155; }
    .mp__skip { background: none; border: 0; padding: 4px 2px; color: #64748b; font-size: 13px; font-weight: 700; text-decoration: underline; cursor: pointer; }
    .mp__chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .mp__chip { position: relative; display: inline-flex; align-items: center; gap: 5px; min-height: 36px; padding: 0 12px 0 9px; border: 1px solid #cbd5e1; border-radius: 999px; background: #fff; font-size: 13px; font-weight: 700; color: #334155; cursor: pointer; }
    .mp__chip mat-icon { width: 18px; height: 18px; font-size: 18px; }
    .mp__chip input { position: absolute; opacity: 0; width: 1px; height: 1px; }
    .mp__chip:focus-within { outline: 2px solid #fb923c; outline-offset: 1px; }
    .mp__chip--on { border-color: #ea580c; background: #fff7ed; color: #c2410c; }
    .mp__other { margin-top: 8px; width: 100%; max-width: 280px; height: 40px; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 10px; background: #f8fafc; font-size: 16px; color: #0f172a; box-sizing: border-box; }
  `,
})
export class MarketplacePicker {
  protected readonly i18n = inject(LanguageService);
  protected readonly t = (en: string, hi: string) => this.i18n.t(en, hi);
  protected readonly options = MARKETPLACE_OPTIONS;
  protected readonly otherMax = MARKETPLACE_OTHER_MAX;

  readonly selected = model<string[]>([]);
  readonly other = model('');
  /** Shows a "Skip" link next to the question. */
  readonly skippable = input(false);
  readonly skip = output<void>();

  toggle(value: string, on: boolean): void {
    this.selected.update((list) => toggleMarketplace(list, value, on));
  }
}
