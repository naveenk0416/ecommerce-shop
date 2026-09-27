import { ChangeDetectionStrategy, Component, DestroyRef, Injector, computed, effect, inject, runInInjectionContext, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { UiCard } from '../listing-workspace/ui/card/card';
import { BarcodeScannerDialog } from '../listing-workspace/ui/barcode-scanner/barcode-scanner-dialog';
import { AuthService } from '../../services/auth';
import { GstRateResult, Listing, ListingService } from '../../services/listing';
import { BarcodeLookupResult, BarcodeService } from '../../services/barcode';
import { AiFieldExtraction } from '../../services/gemini';
import { formatInrCompact, parseAmountInput } from '../../utils/format';
import { AI_IMAGE_MAX_PX, OptimizeSessionService } from './optimize-session.service';
import { resizeImage } from '../../utils/image';
import { WalletService } from '../../services/wallet';

/** General-tab keys this form reads/writes in the session (AI content + seller-entered values). */
type GeneralKey = 'productTitle' | 'category' | 'sku' | 'brand' | 'hsnCode' | 'description'
  | 'costPrice' | 'sellingPrice' | 'mrp' | 'stock' | 'lowStockThreshold';

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
  protected readonly wallet = inject(WalletService);

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

  searchTags = computed(() =>
    (this.value('searchTags'))
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  );

  /** AI price estimate, shown only as a hint — never copied into the saved price fields. */
  suggestedPriceRange = computed(() => {
    const general = this.session.getResult('general');
    const nums = (general?.['suggestedSellingPrice']?.values ?? []).map(parseAmountInput).filter((n): n is number => !!n && n > 0);
    if (!nums.length) return null;
    const low = Math.min(...nums);
    const high = Math.max(...nums);
    const mrp = parseAmountInput(general?.['suggestedMrp']?.values?.[0] ?? null);
    const range = low === high ? formatInrCompact(low) : `${formatInrCompact(low)}–${formatInrCompact(high)}`;
    return mrp && mrp > 0 ? `${range} (typical MRP ${formatInrCompact(mrp)})` : range;
  });

  gst = signal<GstRateResult | null>(null);
  gstLoading = signal(false);
  private gstTimer: ReturnType<typeof setTimeout> | null = null;

  submitAttempted = signal(false);
  isSavingToInventory = signal(false);
  savedToInventory = computed(() => !!this.session.inventoryListingId());

  // ---- Validation (seller-entered business numbers are required; the AI never fills them) ----
  titleError = computed(() => (this.value('productTitle').trim() ? '' : 'Add a product title.'));
  sellingPriceError = computed(() => {
    const n = parseAmountInput(this.value('sellingPrice'));
    if (n === null) return 'Enter your selling price.';
    return n > 0 ? '' : 'Selling price must be more than ₹0.';
  });
  costPriceError = computed(() => {
    const n = parseAmountInput(this.value('costPrice'));
    if (n === null) return 'Enter your cost price.';
    return n >= 0 ? '' : "Cost price can't be negative.";
  });
  mrpError = computed(() => {
    const raw = this.value('mrp');
    if (!raw.trim()) return '';
    const mrp = parseAmountInput(raw);
    const selling = parseAmountInput(this.value('sellingPrice'));
    if (mrp === null || mrp < 0) return 'Enter a valid MRP.';
    return selling && mrp < selling ? "MRP can't be lower than the selling price." : '';
  });
  stockError = computed(() => {
    const n = parseAmountInput(this.value('stock'));
    if (n === null) return 'Enter how many units you have in stock.';
    return Number.isInteger(n) && n >= 0 ? '' : 'Stock must be a whole number (0 or more).';
  });
  thresholdError = computed(() => {
    const raw = this.value('lowStockThreshold');
    if (!raw.trim()) return '';
    const n = parseAmountInput(raw);
    return n !== null && Number.isInteger(n) && n >= 0 ? '' : 'Use a whole number (0 or more).';
  });
  isValid = computed(() => ![this.titleError(), this.sellingPriceError(), this.costPriceError(), this.mrpError(), this.stockError(), this.thresholdError()].some(Boolean));

  constructor() {
    // Recalculate GST (server table) whenever the HSN code or selling price changes.
    effect(() => {
      const hsn = this.value('hsnCode').trim();
      const price = parseAmountInput(this.value('sellingPrice'));
      if (this.gstTimer) clearTimeout(this.gstTimer);
      if (!hsn) {
        this.gst.set(null);
        return;
      }
      this.gstTimer = setTimeout(() => {
        this.gstLoading.set(true);
        this.listingService
          .getGstRate(hsn, price)
          .then((result) => this.gst.set(result))
          .catch(() => this.gst.set(null))
          .finally(() => this.gstLoading.set(false));
      }, 400);
    });
    inject(DestroyRef).onDestroy(() => this.gstTimer && clearTimeout(this.gstTimer));
  }

  /** Current value of a general-tab field (AI draft or seller edit). */
  value(key: GeneralKey | 'searchTags'): string {
    return this.session.getResult('general')?.[key]?.values?.[0] ?? '';
  }

  update(key: GeneralKey, value: string): void {
    this.session.updateField('general', key, value ?? '');
  }

  showError(message: string): boolean {
    return this.submitAttempted() && !!message;
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
    if (this.wallet.cannotAffordListing()) {
      this.wallet.outOfCoins.set(true);
      return;
    }
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
    setField('brand', result.brand);
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

    // No coins → show the out-of-coins screen instead of uploading.
    if (this.wallet.cannotAffordListing()) {
      this.wallet.outOfCoins.set(true);
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const t0 = performance.now();
      const original = reader.result as string;
      // Phone photos are often 3–12 MP; ≤1024px is plenty for the AI and uploads far faster.
      const dataUrl = await resizeImage(original, AI_IMAGE_MAX_PX, AI_IMAGE_MAX_PX, 0.85).catch(() => original);
      console.info(`[timing] photo resize ${Math.round(performance.now() - t0)}ms (${Math.round(original.length / 1024)} KB → ${Math.round(dataUrl.length / 1024)} KB)`);
      const base64 = dataUrl.split(',')[1] ?? '';
      const mimeType = dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : file.type;
      // setImage() starts a new listing and fires the combined Gemini call for every tab.
      this.session.setImage(dataUrl, base64, mimeType);
    };
    reader.onerror = () => this.session.generationError.set('Failed to read the selected file.');
    reader.readAsDataURL(file);
  }

  /**
   * Creates (or, for a listing already saved, updates) the inventory item. Numbers are sent as
   * numbers; GST is not sent at all — the server calculates it from HSN + selling price.
   */
  async saveToInventory(): Promise<void> {
    this.submitAttempted.set(true);
    if (!this.auth.user()) {
      this.snackBar.open('Sign in to save this listing to your inventory.', 'Dismiss', { duration: 4000 });
      return;
    }
    if (!this.isValid()) {
      this.snackBar.open('Fill in the highlighted fields before saving.', 'Dismiss', { duration: 4000 });
      return;
    }

    this.isSavingToInventory.set(true);
    try {
      // Make sure the draft exists (and is current) so the inventory item can link back to it.
      await this.session.saveNow();
      const sellingPrice = parseAmountInput(this.value('sellingPrice'))!;
      const mrp = parseAmountInput(this.value('mrp')) ?? sellingPrice;
      const threshold = parseAmountInput(this.value('lowStockThreshold'));
      const payload: Partial<Listing> = {
        name: this.value('productTitle').trim(),
        category: this.value('category').trim(),
        brand: this.value('brand').trim(),
        sku: this.value('sku').trim() || undefined,
        description: this.value('description').trim(),
        hsnCode: this.value('hsnCode').trim(),
        priceINR: `₹${sellingPrice}`,
        sellingPrice,
        mrp,
        costPrice: parseAmountInput(this.value('costPrice'))!,
        quantity: parseAmountInput(this.value('stock'))!,
        lowStockThreshold: threshold,
        searchTags: this.searchTags(),
        draftId: this.session.draftId() ?? undefined,
      };

      const existingId = this.session.inventoryListingId();
      const saved = existingId
        ? await this.listingService.updateListing(existingId, payload)
        : await this.listingService.saveListing(
            { ...(payload as Listing), material: '', variations: [], platformContent: {} },
            this.session.imagePreview() ?? '',
            null,
          );
      if (saved?.id) await this.session.markSavedToInventory(saved.id);

      const gstNote = typeof saved?.gstRate === 'number' ? ` GST ${saved.gstRate}%.` : ' GST needs review — add or check the HSN code.';
      // The first save to inventory earns bonus coins (granted by the server).
      const bonusBefore = this.wallet.wallet()?.bonuses.find((b) => b.id === 'firstInventorySave');
      const wallet = await this.wallet.load();
      const bonusAfter = wallet?.bonuses.find((b) => b.id === 'firstInventorySave');
      const bonusNote = bonusBefore && !bonusBefore.done && bonusAfter?.done ? ` +${bonusAfter.coins} coins earned!` : '';
      this.snackBar.open(`${existingId ? 'Inventory item updated.' : 'Saved to inventory.'}${gstNote}${bonusNote}`, 'Dismiss', { duration: 4000 });
    } catch (error) {
      this.snackBar.open((error instanceof Error && error.message) || 'Failed to save to inventory. Please try again.', 'Dismiss', { duration: 5000 });
    } finally {
      this.isSavingToInventory.set(false);
    }
  }
}
