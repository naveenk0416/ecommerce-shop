import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Listing } from '../../../services/listing';

export interface ProductFormResult {
  name: string;
  category: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  description: string;
  gstRate: string;
  hsnCode: string;
}

@Component({
  selector: 'app-product-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatDialogModule],
  templateUrl: './product-form-dialog.html',
  styleUrl: './product-form-dialog.scss',
})
export class ProductFormDialog {
  private readonly dialogRef = inject(MatDialogRef<ProductFormDialog, ProductFormResult>);
  protected readonly data = inject<Listing | null>(MAT_DIALOG_DATA as any); // eslint-disable-line @typescript-eslint/no-explicit-any

  isEditing = !!this.data;

  name = signal(this.data?.name ?? '');
  category = signal(this.data?.category ?? '');
  quantity = signal(this.data?.quantity ?? 1);
  costPrice = signal(this.data?.costPrice ?? 0);
  sellingPrice = signal(this.data?.sellingPrice ?? 0);
  description = signal(this.data?.description ?? '');
  gstRate = signal(this.data?.gstRate ?? '18%');
  hsnCode = signal(this.data?.hsnCode ?? '');

  isValid(): boolean {
    return this.name().trim().length > 0 && this.sellingPrice() > 0;
  }

  cancel(): void {
    this.dialogRef.close();
  }

  submit(): void {
    if (!this.isValid()) return;
    this.dialogRef.close({
      name: this.name().trim(),
      category: this.category().trim(),
      quantity: Number(this.quantity()) || 0,
      costPrice: Number(this.costPrice()) || 0,
      sellingPrice: Number(this.sellingPrice()) || 0,
      description: this.description().trim(),
      gstRate: this.gstRate().trim() || '18%',
      hsnCode: this.hsnCode().trim(),
    });
  }
}
