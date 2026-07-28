import { ChangeDetectionStrategy, Component, Injector, computed, effect, inject, runInInjectionContext, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { UiCard } from '../listing-workspace/ui/card/card';
import { BarcodeScannerDialog } from '../listing-workspace/ui/barcode-scanner/barcode-scanner-dialog';
import { AuthService } from '../../services/auth';
import { ListingService } from '../../services/listing';
import { BarcodeLookupResult, BarcodeService } from '../../services/barcode';
import { AiFieldExtraction } from '../../services/gemini';
import { parsePrice } from '../../utils/price';
import { OptimizeSessionService } from './optimize-session.service';

@Component({
  selector: 'app-optimize-general-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, UiCard],
  templateUrl: './optimize-general-details.html',
  styleUrl: './optimize-general-details.scss',
})
export class OptimizeGeneralDetails {
  private readonly listingService = inject(ListingService);
  private readonly barcodeService = inject(BarcodeService);
  private readonly injector = inject(Injector);
  protected readonly auth = inject(AuthService);
  protected readonly session = inject(OptimizeSessionService);

  /** Lazily injected — MatSnackBar/MatDialog as field initializers can throw NG0203 on lazy-loaded routes. */
  private get snackBar(): MatSnackBar {
    return runInInjectionContext(this.injector, () => inject(MatSnackBar));
  }

  private get dialog(): MatDialog {
    return runInInjectionContext(this.injector, () => inject(MatDialog));
  }

  hasDraft = computed(() => this.session.getResult('general') !== undefined);
  isLookingUpBarcode = signal(false);

  selectedImageIndex = signal(0);
  activeImage = computed(() => this.session.galleryImages()[this.selectedImageIndex()] ?? null);

  // Local, freely editable field state — populated from the AI draft, then owned by the user.
  productTitle = signal('');
  category = signal('');
  sku = signal('');
  description = signal('');
  costPrice = signal('');
  sellingPrice = signal('');
  mrp = signal('');
  stock = signal('');
  searchTags = signal<string[]>([]);

  isSavingToInventory = signal(false);
  savedToInventory = signal(false);

  constructor() {
    effect(() => {
      const result = this.session.getResult('general');
      if (!result) return;
      this.productTitle.set(result['productTitle']?.values?.[0] ?? '');
      this.category.set(result['category']?.values?.[0] ?? '');
      this.sku.set(result['sku']?.values?.[0] ?? '');
      this.description.set(result['description']?.values?.[0] ?? '');
      this.costPrice.set(result['costPrice']?.values?.[0] ?? '');
      this.sellingPrice.set(result['sellingPrice']?.values?.[0] ?? '');
      this.mrp.set(result['mrp']?.values?.[0] ?? '');
      this.stock.set(result['stock']?.values?.[0] ?? '');
      this.searchTags.set(
        (result['searchTags']?.values?.[0] ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      );
      this.savedToInventory.set(false);
    });
  }

  onPrimaryFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.uploadPrimary(file);
  }

  onGalleryFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.session.addGalleryImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  selectImage(index: number): void {
    this.selectedImageIndex.set(index);
  }

  /** Re-runs the single combined Gemini call covering this tab and every other tab. */
  generate(): void {
    this.session.generateAll();
  }

  /** Opens the live camera scanner and, on a successful scan, looks up the barcode. */
  scanBarcode(): void {
    this.dialog
      .open(BarcodeScannerDialog, { width: '480px' })
      .afterClosed()
      .subscribe((code) => {
        if (code) this.lookupBarcode(code);
      });
  }

  private lookupBarcode(code: string): void {
    this.isLookingUpBarcode.set(true);
    this.barcodeService
      .lookup(code)
      .then((result) => {
        if (!result.found) {
          this.snackBar.open(`No product data found for barcode ${code}. You can enter details manually.`, 'Dismiss', { duration: 4000 });
          return;
        }
        this.applyBarcodeResult(result);
        this.snackBar.open('Filled the mandatory fields from the scanned barcode.', 'Dismiss', { duration: 3000 });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Barcode lookup failed. Please try again.';
        this.snackBar.open(message, 'Dismiss', { duration: 4000 });
      })
      .finally(() => this.isLookingUpBarcode.set(false));
  }

  /** Merges barcode-sourced values into the mandatory fields, keeping whatever the AI draft
   * already filled in for fields the barcode lookup didn't cover (price, stock, etc.). */
  private applyBarcodeResult(result: BarcodeLookupResult): void {
    const merged: Record<string, AiFieldExtraction> = { ...(this.session.getResult('general') ?? {}) };
    const reason = `From barcode ${result.barcode} lookup.`;

    const setField = (key: string, value: string | null | undefined) => {
      if (!value) return;
      merged[key] = { values: [value], confidence: 95, reason };
    };

    setField('productTitle', result.title);
    setField('category', result.category || result.brand);
    setField('description', result.description);
    setField('sku', result.barcode);

    const tags = [result.brand, result.category].filter((v): v is string => !!v);
    if (tags.length) {
      merged['searchTags'] = { values: [tags.join(', ')], confidence: 90, reason };
    }

    this.session.setResult('general', merged);
  }

  private uploadPrimary(file: File): void {
    this.selectedImageIndex.set(0);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] ?? '';
      // setImage() fires the combined Gemini call for every tab, including this one.
      this.session.setImage(dataUrl, base64, file.type);
    };
    reader.onerror = () => this.session.generationError.set('Failed to read the selected file.');
    reader.readAsDataURL(file);
  }

  saveToInventory(): void {
    if (!this.auth.user()) {
      this.snackBar.open('Sign in to save this listing to your inventory.', 'Dismiss', { duration: 4000 });
      return;
    }
    if (!this.productTitle().trim() || parsePrice(this.sellingPrice()) <= 0) {
      this.snackBar.open('Add a product title and selling price before saving.', 'Dismiss', { duration: 4000 });
      return;
    }

    this.isSavingToInventory.set(true);
    const sellingPrice = parsePrice(this.sellingPrice());
    this.listingService
      .saveListing(
        {
          name: this.productTitle().trim(),
          category: this.category().trim(),
          description: this.description().trim(),
          priceINR: `₹${sellingPrice}`,
          sellingPrice,
          costPrice: parsePrice(this.costPrice()),
          quantity: parsePrice(this.stock()),
          gstRate: '18%',
          hsnCode: '',
          material: '',
          variations: [],
          platformContent: {},
        },
        this.session.imagePreview() ?? '',
        null,
      )
      .then(() => {
        this.savedToInventory.set(true);
        this.snackBar.open('Saved to inventory.', 'Dismiss', { duration: 3000 });
      })
      .catch(() => this.snackBar.open('Failed to save to inventory. Please try again.', 'Dismiss', { duration: 4000 }))
      .finally(() => this.isSavingToInventory.set(false));
  }
}
