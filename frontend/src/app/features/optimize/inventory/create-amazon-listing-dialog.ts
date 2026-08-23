import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
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

type FieldKind = 'text' | 'textarea' | 'select' | 'bullets' | 'number';

interface RenderableField {
  name: string;
  label: string;
  kind: FieldKind;
  options?: string[];
  optional?: boolean;
}

interface DimensionValue {
  value: number;
  unit: string;
}

// Amazon's own declared schema.required for a product type is known to be incomplete — its real
// submission-time validation enforces more (confirmed empirically against a live EARRING
// listing: 18 extra fields rejected that weren't in the static schema's required array at all).
// These are the ones found so far that render as simple text/number inputs; weight, dimensions,
// GTIN exemption, HSN, and unit_count are special-cased below since their shapes are composite.
const KNOWN_EXTRA_TEXT_ATTRIBUTES = [
  'color', 'manufacturer', 'part_number', 'target_audience_keyword', 'generic_keyword',
  'item_type_name', 'packer_contact_information', 'rtip_manufacturer_contact_information',
];
// Genuinely optional per its own schema description ("If a value is not provided, the system
// will attempt a match based on the External Product ID") — rendered, but not required to be
// non-empty, and only sent if it looks like a real 10-character ASIN.
const OPTIONAL_TEXT_ATTRIBUTES = ['merchant_suggested_asin'];
const KNOWN_EXTRA_NUMBER_ATTRIBUTES = ['number_of_items'];
const SPECIAL_ATTRIBUTES = [
  'item_weight', 'item_dimensions', 'unit_count', 'external_product_information',
  'supplier_declared_has_product_identifier_exemption', 'externally_assigned_product_identifier',
];

@Component({
  selector: 'app-create-amazon-listing-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatCheckboxModule, MatProgressSpinnerModule, MatDialogModule],
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

  // Special-cased fields, only shown when the picked product type's schema actually confirms
  // them (a different product type might not need weight/dimensions at all).
  hasWeight = signal(false);
  weightValue = signal(0);
  weightUnits = signal<string[]>([]);
  weightUnit = signal('');

  hasDimensions = signal(false);
  dimensionUnits = signal<string[]>([]);
  length = signal<DimensionValue>({ value: 0, unit: '' });
  width = signal<DimensionValue>({ value: 0, unit: '' });
  height = signal<DimensionValue>({ value: 0, unit: '' });

  hasUnitCount = signal(false);
  hasHsn = signal(false);
  hsnCode = signal(this.listing.hsnCode || '');
  hasGtinExemptionOption = signal(false);
  hasGtinExemption = signal(true); // defaults to "I don't have a barcode" — the common case here

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
    this.hasWeight.set(false);
    this.hasDimensions.set(false);
    this.hasUnitCount.set(false);
    this.hasHsn.set(false);
    this.hasGtinExemptionOption.set(false);

    try {
      const extraNames = [...KNOWN_EXTRA_TEXT_ATTRIBUTES, ...OPTIONAL_TEXT_ATTRIBUTES, ...KNOWN_EXTRA_NUMBER_ATTRIBUTES, ...SPECIAL_ATTRIBUTES];
      const schema = await this.marketplaceConnections.getAmazonProductTypeSchema(productType, extraNames);
      const byName = new Map(schema.attributes.map((a) => [a.name, a]));

      const simpleNames = Array.from(new Set([
        ...schema.required,
        ...KNOWN_EXTRA_TEXT_ATTRIBUTES,
        ...OPTIONAL_TEXT_ATTRIBUTES,
        ...KNOWN_EXTRA_NUMBER_ATTRIBUTES,
      ])).filter((name) => name !== 'purchasable_offer' && name !== 'fulfillment_availability');

      const fields: RenderableField[] = [];
      const unsupported: string[] = [];
      const isNumberAttr = (name: string) => KNOWN_EXTRA_NUMBER_ATTRIBUTES.includes(name);
      const isOptionalAttr = (name: string) => OPTIONAL_TEXT_ATTRIBUTES.includes(name);

      for (const name of simpleNames) {
        const attr = byName.get(name);
        const valueField = attr?.fields?.find((f) => f.name === 'value');
        if (!attr || !valueField) {
          // Only the schema's own declared-required fields are hard blockers — the "known
          // extra" list is opportunistic (a different product type just may not need them).
          if (schema.required.includes(name)) unsupported.push(name);
          continue;
        }
        this.attributeSchemas.set(name, attr);
        const optional = isOptionalAttr(name);

        if (isNumberAttr(name)) {
          fields.push({ name, label: this.labelFor(name), kind: 'number', optional });
        } else if (valueField.enum && valueField.enum.length) {
          fields.push({ name, label: this.labelFor(name), kind: 'select', options: valueField.enum.map(String), optional });
        } else if (name === 'bullet_point') {
          fields.push({ name, label: this.labelFor(name), kind: 'bullets', optional });
        } else if (valueField.type === 'string' && (name.includes('description') || (valueField.description || '').length > 150)) {
          fields.push({ name, label: this.labelFor(name), kind: 'textarea', optional });
        } else if (valueField.type === 'string') {
          fields.push({ name, label: this.labelFor(name), kind: 'text', optional });
        } else if (schema.required.includes(name)) {
          unsupported.push(name);
        }
      }

      // Special-cased composite attributes — only surfaced if this product type's schema
      // actually defines them.
      const weightAttr = byName.get('item_weight');
      const weightUnitField = weightAttr?.fields?.find((f) => f.name === 'unit');
      if (weightAttr && weightUnitField?.enum) {
        this.hasWeight.set(true);
        this.weightUnits.set(weightUnitField.enum.map(String));
        this.weightUnit.set(String(weightUnitField.enum[0]));
      }

      const dimensionsAttr = byName.get('item_dimensions');
      const lengthUnitField = dimensionsAttr?.fields?.find((f) => f.name === 'length')?.nestedFields?.find((f) => f.name === 'unit');
      if (dimensionsAttr && lengthUnitField?.enum) {
        this.hasDimensions.set(true);
        const units = lengthUnitField.enum.map(String);
        this.dimensionUnits.set(units);
        this.length.set({ value: 0, unit: units[0] });
        this.width.set({ value: 0, unit: units[0] });
        this.height.set({ value: 0, unit: units[0] });
      }

      this.hasUnitCount.set(!!byName.get('unit_count'));

      const externalProductInfoAttr = byName.get('external_product_information');
      this.hasHsn.set(!!externalProductInfoAttr);

      this.hasGtinExemptionOption.set(!!byName.get('supplier_declared_has_product_identifier_exemption'));

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
      else if (field.name === 'brand' || field.name === 'manufacturer') values[field.name] = this.listing.brand || '';
      else if (field.name === 'product_description') values[field.name] = this.listing.description || '';
      else if (field.options?.includes('IN') && field.name === 'country_of_origin') values[field.name] = 'IN';
      else if (field.options?.includes('not_applicable')) values[field.name] = 'not_applicable';
      else if (field.kind === 'select' && field.options?.length) values[field.name] = field.options[0];
      else if (field.kind === 'number') values[field.name] = '1';
      else values[field.name] = '';
    }
    this.fieldValues.set(values);
  }

  setFieldValue(name: string, value: string): void {
    this.fieldValues.update((v) => ({ ...v, [name]: value }));
  }

  setLength(patch: Partial<DimensionValue>): void {
    this.length.update((v) => ({ ...v, ...patch }));
  }

  setWidth(patch: Partial<DimensionValue>): void {
    this.width.update((v) => ({ ...v, ...patch }));
  }

  setHeight(patch: Partial<DimensionValue>): void {
    this.height.update((v) => ({ ...v, ...patch }));
  }

  isValid(): boolean {
    if (!this.selectedProductType() || this.requiredFields().length === 0 || this.unsupportedAttributes().length > 0) return false;
    const values = this.fieldValues();
    const simpleFieldsOk = this.requiredFields().every((field) => field.optional || (values[field.name] || '').trim().length > 0);
    const weightOk = !this.hasWeight() || this.weightValue() > 0;
    const dimensionsOk = !this.hasDimensions() || (this.length().value > 0 && this.width().value > 0 && this.height().value > 0);
    const hsnOk = !this.hasHsn() || this.hsnCode().trim().length > 0;
    const gtinOk = this.hasGtinExemption() || !this.hasGtinExemptionOption();
    return simpleFieldsOk && weightOk && dimensionsOk && hsnOk && gtinOk;
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
      const raw = (values[field.name] || '').trim();
      // Optional fields (currently just merchant_suggested_asin) are only sent when filled in —
      // and that one specifically must be a real 10-character ASIN or Amazon rejects it outright,
      // so a shorter/blank value is dropped rather than submitted.
      if (field.optional && (!raw || raw.length !== 10)) continue;

      const attrSchema = this.attributeSchemas.get(field.name);
      const needsLanguageTag = !!attrSchema?.itemRequired?.includes('language_tag');
      const rawValues = field.kind === 'bullets'
        ? raw.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 5)
        : [raw];

      attributes[field.name] = rawValues.map((value) => (
        needsLanguageTag ? { value, language_tag: 'en_IN' } : { value }
      ));
    }

    if (this.hasWeight()) {
      attributes['item_weight'] = [{ value: this.weightValue(), unit: this.weightUnit() }];
    }
    if (this.hasDimensions()) {
      attributes['item_dimensions'] = [{
        length: { value: this.length().value, unit: this.length().unit },
        width: { value: this.width().value, unit: this.width().unit },
        height: { value: this.height().value, unit: this.height().unit },
      }];
    }
    if (this.hasUnitCount()) {
      // Individual items (not sold by volume/weight/pack) — "count" per Amazon's own guidance
      // for this attribute. The nested `type` object needs its own language_tag, same as the
      // top-level text attributes — missing it was rejected as "not enough values" the first time.
      attributes['unit_count'] = [{ value: 1, type: { value: 'count', language_tag: 'en_IN' } }];
    }
    if (this.hasHsn()) {
      attributes['external_product_information'] = [{ entity: 'HSN', value: this.hsnCode().trim() }];
    }
    if (this.hasGtinExemptionOption()) {
      attributes['supplier_declared_has_product_identifier_exemption'] = [{ value: this.hasGtinExemption() }];
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
