import { ChangeDetectionStrategy, Component, Injector, computed, effect, inject, runInInjectionContext, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UiCard } from '../listing-workspace/ui/card/card';
import { AuthService } from '../../services/auth';
import { ListingService } from '../../services/listing';
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
  private readonly injector = inject(Injector);
  protected readonly auth = inject(AuthService);
  protected readonly session = inject(OptimizeSessionService);

  /** Lazily injected — MatSnackBar as a field initializer can throw NG0203 on lazy-loaded routes. */
  private get snackBar(): MatSnackBar {
    return runInInjectionContext(this.injector, () => inject(MatSnackBar));
  }

  hasDraft = computed(() => this.session.getResult('general') !== undefined);

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
