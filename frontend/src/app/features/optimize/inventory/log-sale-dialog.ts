import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Listing, Sale } from '../../../services/listing';
import { parsePrice } from '../../../utils/price';
import { hasRealVariants, variantLabel } from '../../../config/size-presets';
import { LanguageService } from '../../../services/language';

export type SalePlatform = Sale['platform'];

export interface LogSaleResult {
  quantity: number;
  salePrice: number;
  platform: SalePlatform;
  /** The size/colour sold (products with sizes). */
  variantId?: string;
}

@Component({
  selector: 'app-log-sale-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatDialogModule],
  templateUrl: './log-sale-dialog.html',
  styleUrl: './log-sale-dialog.scss',
})
export class LogSaleDialog {
  private readonly dialogRef = inject(MatDialogRef<LogSaleDialog, LogSaleResult>);
  protected readonly listing = inject<Listing>(MAT_DIALOG_DATA as any); // eslint-disable-line @typescript-eslint/no-explicit-any

  protected readonly platforms: SalePlatform[] = ['Amazon', 'Flipkart', 'Meesho', 'Instagram', 'Offline', 'Other'];
  protected readonly i18n = inject(LanguageService);
  protected readonly label = variantLabel;

  /** Products with sizes: the sale takes stock from one size/colour only. */
  readonly variants = hasRealVariants(this.listing.variants) ? this.listing.variants! : [];
  readonly variantId = signal<string | null>(null);
  readonly selectedVariant = computed(() => this.variants.find((v) => v.id === this.variantId()) ?? null);

  get availableStock(): number {
    if (this.variants.length) return this.selectedVariant()?.stock ?? 0;
    return Number(this.listing.quantity ?? 0);
  }

  platform = signal<SalePlatform>('Amazon');
  quantity = signal(1);
  salePrice = signal(this.listing.sellingPrice || parsePrice(this.listing.priceINR));

  errorMessage = signal<string | null>(null);

  cancel(): void {
    this.dialogRef.close();
  }

  chooseVariant(id: string): void {
    this.variantId.set(id || null);
    const v = this.selectedVariant();
    if (v?.price) this.salePrice.set(v.price);
  }

  submit(): void {
    if (this.variants.length && !this.selectedVariant()) {
      this.errorMessage.set(this.i18n.t('Choose the size / colour that was sold.', 'कौन सा size / रंग बिका, चुनें।'));
      return;
    }
    const qty = Number(this.quantity());
    if (!Number.isInteger(qty) || qty <= 0) {
      this.errorMessage.set('Enter a whole number of 1 or more.');
      return;
    }
    if (qty > this.availableStock) {
      this.errorMessage.set(`Only ${this.availableStock} units in stock — you can't sell ${qty}.`);
      return;
    }
    this.errorMessage.set(null);
    this.dialogRef.close({
      quantity: qty,
      salePrice: Math.max(0, Number(this.salePrice()) || 0),
      platform: this.platform(),
      ...(this.selectedVariant() ? { variantId: this.selectedVariant()!.id } : {}),
    });
  }
}
