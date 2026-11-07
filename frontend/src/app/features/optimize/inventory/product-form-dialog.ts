import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DEFAULT_LOW_STOCK_THRESHOLD, GstRateResult, Listing, ListingService } from '../../../services/listing';
import { hasRealVariants, totalStock, Variant } from '../../../config/size-presets';
import { VariantEditor } from '../variants/variant-editor';

/** GST isn't part of the result: the server calculates it from HSN + selling price on save. */
export interface ProductFormResult {
  name: string;
  category: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  mrp: number;
  description: string;
  hsnCode: string;
  lowStockThreshold: number | null;
  /** Sizes & colours with stock per size; a single default entry when sizes were removed. */
  variants?: Variant[];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

@Component({
  selector: 'app-product-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatDialogModule, VariantEditor],
  templateUrl: './product-form-dialog.html',
  styleUrl: './product-form-dialog.scss',
  host: {
    '(keydown.escape)': 'onEscape($event)',
    '(keydown.tab)': 'trapTab($event)',
    '(keydown.shift.tab)': 'trapTab($event)',
  },
})
export class ProductFormDialog {
  private readonly dialogRef = inject(MatDialogRef<ProductFormDialog, ProductFormResult | 'open-full-listing'>);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Fields the seller has left (blur) — errors show only for these, or for all after a submit. */
  readonly touched = signal<ReadonlySet<string>>(new Set());
  readonly submitted = signal(false);
  private readonly listingService = inject(ListingService);
  protected readonly data = inject<Listing | null>(MAT_DIALOG_DATA as any); // eslint-disable-line @typescript-eslint/no-explicit-any

  isEditing = !!this.data;
  canOpenFullListing = !!this.data?.draftId;
  readonly defaultThreshold = DEFAULT_LOW_STOCK_THRESHOLD;

  name = signal(this.data?.name ?? '');
  category = signal(this.data?.category ?? '');
  quantity = signal<number | null>(num(this.data?.quantity) ?? (this.data ? 0 : null));
  costPrice = signal<number | null>(num(this.data?.costPrice));
  sellingPrice = signal<number | null>(num(this.data?.sellingPrice));
  mrp = signal<number | null>(num(this.data?.mrp) || null);
  description = signal(this.data?.description ?? '');
  hsnCode = signal(this.data?.hsnCode ?? '');
  lowStockThreshold = signal<number | null>(num(this.data?.lowStockThreshold));

  /** Sizes & colours; empty = a product without sizes. */
  readonly hadSizes = hasRealVariants(this.data?.variants);
  variants = signal<Variant[]>(this.hadSizes ? this.data!.variants!.map((v) => ({ ...v })) : []);
  sizePreset = signal<string | null>(this.hadSizes ? 'custom' : null);
  readonly hasSizes = computed(() => hasRealVariants(this.variants()));
  readonly sizeTotal = computed(() => totalStock(this.variants()));
  /** Sizes already on Amazon keep their SKUs: only stock and price can change here. */
  readonly sizesLocked = !!this.data?.amazonFamily && !this.data.amazonFamily.test;

  gst = signal<GstRateResult | null>(null);
  private gstTimer: ReturnType<typeof setTimeout> | null = null;

  errors = computed(() => {
    const e: Record<string, string> = {};
    if (!this.name().trim()) e['name'] = 'Enter a product name.';
    const sell = num(this.sellingPrice());
    if (sell === null || sell <= 0) e['sellingPrice'] = 'Enter a selling price above ₹0.';
    const cost = num(this.costPrice());
    if (cost !== null && cost < 0) e['costPrice'] = "Cost price can't be negative.";
    const qty = num(this.quantity());
    if (!this.hasSizes() && (qty === null || qty < 0 || !Number.isInteger(qty))) e['quantity'] = 'Stock must be a whole number (0 or more).';
    const mrp = num(this.mrp());
    if (mrp !== null && (mrp < 0 || (sell && mrp < sell))) e['mrp'] = "MRP can't be lower than the selling price.";
    const t = num(this.lowStockThreshold());
    if (t !== null && (t < 0 || !Number.isInteger(t))) e['lowStockThreshold'] = 'Use a whole number (0 or more).';
    return e;
  });

  constructor() {
    effect(() => {
      const hsn = this.hsnCode().trim();
      const price = num(this.sellingPrice());
      if (this.gstTimer) clearTimeout(this.gstTimer);
      if (!hsn) {
        this.gst.set(null);
        return;
      }
      this.gstTimer = setTimeout(() => {
        this.listingService.getGstRate(hsn, price).then((r) => this.gst.set(r)).catch(() => this.gst.set(null));
      }, 400);
    });
    inject(DestroyRef).onDestroy(() => this.gstTimer && clearTimeout(this.gstTimer));
  }

  isValid(): boolean {
    return Object.keys(this.errors()).length === 0;
  }

  /** The error for a field, once the seller has left it or tried to submit. */
  shownError(key: string): string | null {
    if (!this.submitted() && !this.touched().has(key)) return null;
    return this.errors()[key] ?? null;
  }

  touch(key: string): void {
    if (this.touched().has(key)) return;
    this.touched.update((set) => new Set(set).add(key));
  }

  /** Esc closes the dialog (also when a host listener elsewhere swallowed the CDK's own handler). */
  onEscape(event: Event): void {
    event.stopPropagation();
    this.dialogRef.close();
  }

  /** Keeps Tab / Shift+Tab inside the dialog. */
  trapTab(event: Event): void {
    const key = event as KeyboardEvent;
    const container = this.host.nativeElement.closest('.mat-mdc-dialog-container') ?? this.host.nativeElement;
    const focusable = Array.from(container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (key.shiftKey && (active === first || !container.contains(active))) {
      key.preventDefault();
      last.focus();
    } else if (!key.shiftKey && (active === last || !container.contains(active))) {
      key.preventDefault();
      first.focus();
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  openFullListing(): void {
    this.dialogRef.close('open-full-listing');
  }

  submit(): void {
    this.submitted.set(true);
    if (!this.isValid()) {
      // Every required-field error is now visible; move to the first one.
      setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const sellingPrice = num(this.sellingPrice())!;
    this.dialogRef.close({
      name: this.name().trim(),
      category: this.category().trim(),
      quantity: this.hasSizes() ? this.sizeTotal() : num(this.quantity()) ?? 0,
      costPrice: num(this.costPrice()) ?? 0,
      sellingPrice,
      mrp: num(this.mrp()) ?? sellingPrice,
      description: this.description().trim(),
      hsnCode: this.hsnCode().trim(),
      lowStockThreshold: num(this.lowStockThreshold()),
      ...(this.hasSizes()
        ? { variants: this.variants() }
        : this.hadSizes ? { variants: [{ id: 'default', size: null, colour: null, sku: '', stock: num(this.quantity()) ?? 0, price: null, mrp: null, imageIds: [] }] } : {}),
    });
  }
}
