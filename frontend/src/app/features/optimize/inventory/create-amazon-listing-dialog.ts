import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Listing } from '../../../services/listing';
import {
  AmazonAttributeSummary,
  AmazonProductType,
  CreateAmazonListingPayload,
  MarketplaceConnectionsService,
} from '../../../services/marketplace-connections';

type FieldKind = 'text' | 'textarea' | 'select' | 'bullets';

interface RenderableField {
  name: string;
  label: string;
  kind: FieldKind;
  options?: string[];
}

@Component({
  selector: 'app-create-amazon-listing-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatDialogModule],
  templateUrl: './create-amazon-listing-dialog.html',
  styleUrl: './create-amazon-listing-dialog.scss',
})
export class CreateAmazonListingDialog {
  private readonly dialogRef = inject(MatDialogRef<CreateAmazonListingDialog, boolean>);
  private readonly marketplaceConnections = inject(MarketplaceConnectionsService);
  protected readonly listing = inject<Listing>(MAT_DIALOG_DATA as any); // eslint-disable-line @typescript-eslint/no-explicit-any

  keywords = signal(this.listing.category || this.listing.name || '');
  searching = signal(false);
  searchError = signal<string | null>(null);
  productTypes = signal<AmazonProductType[]>([]);

  selectedProductType = signal<string | null>(null);
  loadingSchema = signal(false);
  schemaError = signal<string | null>(null);
  requiredFields = signal<RenderableField[]>([]);
  unsupportedAttributes = signal<string[]>([]);
  fieldValues = signal<Record<string, string>>({});

  submitting = signal(false);
  submitError = signal<string | null>(null);

  /** Full schema summaries for the fields being rendered — kept alongside requiredFields so
   * submit() can check itemRequired (e.g. whether language_tag belongs in the value) without
   * re-fetching. */
  private attributeSchemas = new Map<string, AmazonAttributeSummary>();

  async search(): Promise<void> {
    const keywords = this.keywords().trim();
    if (!keywords) return;
    this.searching.set(true);
    this.searchError.set(null);
    this.productTypes.set([]);
    this.selectedProductType.set(null);
    this.requiredFields.set([]);
    try {
      const results = await this.marketplaceConnections.searchAmazonProductTypes(keywords);
      this.productTypes.set(results);
      if (results.length === 0) this.searchError.set('No matching Amazon product types found. Try a different search term.');
    } catch (error) {
      this.searchError.set((error instanceof Error && error.message) || 'Search failed. Please try again.');
    } finally {
      this.searching.set(false);
    }
  }

  async selectProductType(productType: string): Promise<void> {
    this.selectedProductType.set(productType);
    this.loadingSchema.set(true);
    this.schemaError.set(null);
    this.requiredFields.set([]);
    this.unsupportedAttributes.set([]);
    this.attributeSchemas.clear();

    try {
      const schema = await this.marketplaceConnections.getAmazonProductTypeSchema(productType);
      const relevantNames = schema.required.filter((name) => name !== 'purchasable_offer' && name !== 'fulfillment_availability');
      const fields: RenderableField[] = [];
      const unsupported: string[] = [];

      for (const name of relevantNames) {
        const attr = schema.attributes.find((a) => a.name === name);
        const valueField = attr?.fields?.find((f) => f.name === 'value');
        if (!attr || !valueField) {
          unsupported.push(name);
          continue;
        }
        this.attributeSchemas.set(name, attr);

        if (valueField.enum && valueField.enum.length) {
          fields.push({ name, label: this.labelFor(name), kind: 'select', options: valueField.enum.map(String) });
        } else if (name === 'bullet_point') {
          fields.push({ name, label: this.labelFor(name), kind: 'bullets' });
        } else if (valueField.type === 'string' && (name.includes('description') || (valueField.description || '').length > 150)) {
          fields.push({ name, label: this.labelFor(name), kind: 'textarea' });
        } else if (valueField.type === 'string') {
          fields.push({ name, label: this.labelFor(name), kind: 'text' });
        } else {
          unsupported.push(name);
        }
      }

      this.requiredFields.set(fields);
      this.unsupportedAttributes.set(unsupported);
      this.prefillValues(fields);
    } catch (error) {
      this.schemaError.set((error instanceof Error && error.message) || 'Failed to load requirements for this product type.');
    } finally {
      this.loadingSchema.set(false);
    }
  }

  private labelFor(name: string): string {
    return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private prefillValues(fields: RenderableField[]): void {
    const values: Record<string, string> = {};
    for (const field of fields) {
      if (field.name === 'item_name') values[field.name] = this.listing.name || '';
      else if (field.name === 'brand') values[field.name] = this.listing.brand || '';
      else if (field.name === 'product_description') values[field.name] = this.listing.description || '';
      else if (field.options?.includes('IN') && field.name === 'country_of_origin') values[field.name] = 'IN';
      else if (field.options?.includes('not_applicable')) values[field.name] = 'not_applicable';
      else if (field.kind === 'select' && field.options?.length) values[field.name] = field.options[0];
      else values[field.name] = '';
    }
    this.fieldValues.set(values);
  }

  setFieldValue(name: string, value: string): void {
    this.fieldValues.update((v) => ({ ...v, [name]: value }));
  }

  isValid(): boolean {
    if (!this.selectedProductType() || this.requiredFields().length === 0 || this.unsupportedAttributes().length > 0) return false;
    const values = this.fieldValues();
    return this.requiredFields().every((field) => (values[field.name] || '').trim().length > 0);
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  async submit(): Promise<void> {
    if (!this.isValid() || !this.listing.id) return;
    this.submitting.set(true);
    this.submitError.set(null);

    const values = this.fieldValues();
    const attributes: Record<string, Array<Record<string, unknown>>> = {};

    for (const field of this.requiredFields()) {
      const attrSchema = this.attributeSchemas.get(field.name);
      const needsLanguageTag = !!attrSchema?.itemRequired?.includes('language_tag');
      const raw = values[field.name] || '';

      const rawValues = field.kind === 'bullets'
        ? raw.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 5)
        : [raw.trim()];

      attributes[field.name] = rawValues.map((value) => (
        needsLanguageTag ? { value, language_tag: 'en_IN' } : { value }
      ));
    }

    const payload: CreateAmazonListingPayload = { productType: this.selectedProductType()!, attributes };

    try {
      await this.marketplaceConnections.createAmazonListing(this.listing.id, payload);
      this.dialogRef.close(true);
    } catch (error) {
      this.submitError.set((error instanceof Error && error.message) || 'Failed to create the Amazon listing. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }
}
