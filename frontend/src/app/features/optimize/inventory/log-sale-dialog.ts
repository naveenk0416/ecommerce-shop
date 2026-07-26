import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Listing, Sale } from '../../../services/listing';
import { parsePrice } from '../../../utils/price';

export type SalePlatform = Sale['platform'];

export interface LogSaleResult {
  quantity: number;
  salePrice: number;
  platform: SalePlatform;
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

  availableStock = Number(this.listing.quantity ?? 0);

  platform = signal<SalePlatform>('Amazon');
  quantity = signal(1);
  salePrice = signal(this.listing.sellingPrice || parsePrice(this.listing.priceINR));

  errorMessage = signal<string | null>(null);

  cancel(): void {
    this.dialogRef.close();
  }

  submit(): void {
    const qty = Number(this.quantity());
    if (qty <= 0) {
      this.errorMessage.set('Enter a quantity greater than zero.');
      return;
    }
    if (qty > this.availableStock) {
      this.errorMessage.set(`Only ${this.availableStock} units in stock — you can't sell ${qty}.`);
      return;
    }
    this.errorMessage.set(null);
    this.dialogRef.close({
      quantity: qty,
      salePrice: Number(this.salePrice()) || 0,
      platform: this.platform(),
    });
  }
}
