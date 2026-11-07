import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { LanguageService } from '../../services/language';
import { isMissingBrand } from './brand.util';

/** { brand } = save as the Profile default brand; { brand: null } = continue without a brand. */
export interface BrandPromptResult { brand: string | null }

/**
 * Asked before the first AI listing when Profile has no default brand, so "Generic" is never
 * written silently. Closing it (Esc / Cancel) cancels the generation; no coins are spent.
 */
@Component({
  selector: 'app-brand-prompt-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ i18n.t('What is your brand name?', 'आपका brand name क्या है?', 'మీ brand పేరు ఏమిటి?', 'ನಿಮ್ಮ brand ಹೆಸರು ಏನು?') }}</h2>
    <form (submit)="$event.preventDefault(); save()" novalidate>
      <mat-dialog-content>
        <p class="brand__intro">
          {{ i18n.t(
            'Amazon and Flipkart need the brand exactly as it is approved on your seller account. We save it in Profile and use it for every listing and bulk file.',
            'Amazon और Flipkart को brand बिल्कुल वैसा चाहिए जैसा आपके seller account पर approved है। हम इसे Profile में save करके हर listing और bulk file में इस्तेमाल करेंगे।',
            'Amazon, Flipkart కి మీ seller account లో approve అయిన brand అలాగే కావాలి. దీన్ని Profile లో save చేసి ప్రతి listing, bulk file లో వాడతాం.',
            'Amazon, Flipkart‌ಗೆ ನಿಮ್ಮ seller account‌ನಲ್ಲಿ approve ಆದ brand ಹಾಗೆಯೇ ಬೇಕು. ಇದನ್ನು Profile‌ನಲ್ಲಿ save ಮಾಡಿ ಪ್ರತಿ listing, bulk file‌ನಲ್ಲಿ ಬಳಸುತ್ತೇವೆ.') }}
        </p>
        <label class="brand__field" for="brand-prompt-input">
          <span class="brand__label">{{ i18n.t('Brand name', 'Brand name', 'Brand పేరు', 'Brand ಹೆಸರು') }} *</span>
          <input
            id="brand-prompt-input"
            class="brand__input"
            type="text"
            maxlength="100"
            required
            autocomplete="organization"
            cdkFocusInitial
            [value]="brand()"
            (input)="brand.set($any($event.target).value)"
            (blur)="touched.set(true)"
            [attr.aria-invalid]="!!error()"
            [attr.aria-describedby]="error() ? 'brand-prompt-error' : null"
            data-testid="brand-prompt-input"
          />
          @if (error()) {
            <span id="brand-prompt-error" class="brand__error" role="alert">{{ error() }}</span>
          }
        </label>

        <button type="button" class="brand__help-link" (click)="showHelp.set(!showHelp())" [attr.aria-expanded]="showHelp()" aria-controls="brand-prompt-help" data-testid="brand-prompt-help">
          {{ i18n.t('No brand / I need approval', 'Brand नहीं है / approval चाहिए', 'Brand లేదు / approval కావాలి', 'Brand ಇಲ್ಲ / approval ಬೇಕು') }}
        </button>
        @if (showHelp()) {
          <div id="brand-prompt-help" class="brand__help">
            <p>{{ i18n.t(
              'Flipkart no longer accepts "Generic" for categories such as jewellery, and Amazon allows it only for genuinely unbranded products. Apply for brand approval in Flipkart Seller Hub (Listings → Brand approval) or Amazon Brand Registry, then enter the approved name here or in Profile.',
              'Flipkart अब jewellery जैसी categories में "Generic" नहीं लेता, और Amazon इसे सिर्फ़ बिना brand वाले products के लिए मानता है। Flipkart Seller Hub (Listings → Brand approval) या Amazon Brand Registry में brand approval लें, फिर approved नाम यहाँ या Profile में लिखें।') }}</p>
            <button mat-stroked-button type="button" (click)="skip()" data-testid="brand-prompt-skip">
              {{ i18n.t('Continue without a brand', 'बिना brand के आगे बढ़ें', 'Brand లేకుండా కొనసాగండి', 'Brand ಇಲ್ಲದೆ ಮುಂದುವರಿಯಿರಿ') }}
            </button>
            <p class="brand__help-note">{{ i18n.t(
              'The Brand field stays empty and is flagged until you fill it in.',
              'Brand field खाली रहेगा और भरने तक flag रहेगा।') }}</p>
          </div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-stroked-button type="button" [mat-dialog-close]="undefined">{{ i18n.t('Cancel', 'रद्द करें', 'రద్దు', 'ರದ್ದು') }}</button>
        <button mat-flat-button color="primary" type="submit" data-testid="brand-prompt-save">
          {{ i18n.t('Save brand and continue', 'Brand save करके आगे बढ़ें', 'Brand save చేసి కొనసాగండి', 'Brand save ಮಾಡಿ ಮುಂದುವರಿಯಿರಿ') }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .brand__intro { margin: 0 0 14px; color: #475569; font-size: 14px; line-height: 1.5; }
    .brand__field { display: flex; flex-direction: column; gap: 6px; }
    .brand__label { font-size: 13px; font-weight: 700; color: #0f172a; }
    .brand__input { min-height: 44px; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font: inherit; font-size: 15px; }
    .brand__input[aria-invalid='true'] { border-color: #dc2626; }
    .brand__error { font-size: 12px; color: #b91c1c; }
    .brand__help-link { margin-top: 12px; padding: 8px 0; min-height: 44px; background: none; border: 0; color: #4f46e5; font: inherit; font-size: 13px; font-weight: 600; text-decoration: underline; cursor: pointer; }
    .brand__help { margin-top: 4px; padding: 12px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; font-size: 13px; color: #334155; }
    .brand__help p { margin: 0 0 10px; line-height: 1.5; }
    .brand__help-note { margin: 8px 0 0 !important; color: #64748b; font-size: 12px; }
  `,
})
export class BrandPromptDialog {
  protected readonly i18n = inject(LanguageService);
  private readonly dialogRef = inject(MatDialogRef<BrandPromptDialog, BrandPromptResult>);

  readonly brand = signal('');
  readonly touched = signal(false);
  readonly submitted = signal(false);
  readonly showHelp = signal(false);

  error(): string | null {
    if (!this.touched() && !this.submitted()) return null;
    const value = this.brand().trim();
    if (!value) return this.i18n.t('Enter your brand name.', 'अपना brand name लिखें।', 'మీ brand పేరు రాయండి.', 'ನಿಮ್ಮ brand ಹೆಸರು ಬರೆಯಿರಿ.');
    if (isMissingBrand(value)) return this.i18n.t('"Generic" is not accepted — enter your own brand, or use "No brand / I need approval".', '"Generic" नहीं चलेगा — अपना brand लिखें, या "Brand नहीं है / approval चाहिए" देखें।');
    return null;
  }

  save(): void {
    this.submitted.set(true);
    if (this.error()) return;
    this.dialogRef.close({ brand: this.brand().trim() });
  }

  skip(): void {
    this.dialogRef.close({ brand: null });
  }
}
