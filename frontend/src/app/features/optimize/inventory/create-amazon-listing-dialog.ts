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
  AmazonListingIssue,
  AmazonProductType,
  AmazonProductTypeSchema,
  CreateAmazonListingPayload,
  MarketplaceConnectionsService,
} from '../../../services/marketplace-connections';
import { ApiError } from '../../../services/api';

type FieldKind = 'text' | 'textarea' | 'select' | 'bullets' | 'number';

interface RenderableField {
  name: string;
  label: string;
  kind: FieldKind;
  options?: string[];
  optional?: boolean;
}

/** One numeric+unit input pair within a "quantity" attribute — `key` is 'value' for a flat
 * attribute (item_weight: { value, unit }) or the axis's own field name for a nested composite
 * (item_dimensions.length: { value, unit }, item_width_height.height: { value, unit }, etc.). */
interface QuantityAxis {
  key: string;
  label: string;
  value: number;
  unit: string;
  unitOptions: string[];
}

/** A single Amazon attribute rendered as one or more numeric+unit inputs — covers item_weight,
 * item_dimensions, and any other category's differently-named quantity attribute (capacity,
 * item_width_height, ...) via the same shape-detection logic rather than one hardcoded field per
 * attribute name. */
interface QuantityAttribute {
  name: string;
  label: string;
  axes: QuantityAxis[];
}

// Amazon's own declared schema.required for a product type is known to be incomplete — its real
// submission-time validation enforces more, and which extra attributes are required varies by
// category (confirmed empirically: EARRING/HAIR_CARE needed color/hair_type/lifestyle/etc.;
// HAIR_CLIP needed nothing extra once purchasable_offer was fixed; BOTTLE needed
// model_number/material/capacity/etc.; jewelry needed gem_type/clasp_type/etc. — a different set
// every time). These are the ones found so far that render as simple text/number inputs — kept as
// a head start fetched proactively so the common cases don't need a failed submit first; anything
// else Amazon names in a rejection gets added on the fly by addMissingAttributes() below.
const KNOWN_EXTRA_TEXT_ATTRIBUTES = [
  'color', 'manufacturer', 'part_number', 'target_audience_keyword', 'generic_keyword',
  'item_type_name', 'packer_contact_information', 'rtip_manufacturer_contact_information',
  'hair_type', 'lifestyle',
];
// Genuinely optional per its own schema description ("If a value is not provided, the system
// will attempt a match based on the External Product ID") — rendered, but not required to be
// non-empty, and only sent if it looks like a real 10-character ASIN.
const OPTIONAL_TEXT_ATTRIBUTES = ['merchant_suggested_asin'];
const KNOWN_EXTRA_NUMBER_ATTRIBUTES = ['number_of_items'];
// Proactively fetched and auto-detected as quantity (value+unit) attributes via shape inspection
// — see detectQuantityAxes(). Any other category's quantity-shaped attribute (capacity,
// item_width_height, ...) gets the same treatment once named in a rejection.
const QUANTITY_LIKE_ATTRIBUTES = ['item_weight', 'item_dimensions'];
// Composite attributes with a fixed, hand-built shape this dialog knows how to submit —
// distinct from generic quantity/text attributes, so kept as dedicated fields rather than
// generalized.
const COMPOSITE_SPECIAL_ATTRIBUTES = [
  'unit_count', 'external_product_information', 'supplier_declared_has_product_identifier_exemption',
  'externally_assigned_product_identifier',
];
// Never form-fillable — fully backend-computed from price/quantity, so a rejection naming these
// can't be resolved by adding an input field.
const BACKEND_MANAGED_ATTRIBUTES = ['purchasable_offer', 'fulfillment_availability'];

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
  quantityAttributes = signal<QuantityAttribute[]>([]);
  unsupportedAttributes = signal<string[]>([]);
  fieldValues = signal<Record<string, string>>({});

  hasUnitCount = signal(false);
  hasHsn = signal(false);
  hsnCode = signal(this.listing.hsnCode || '');
  hasGtinExemptionOption = signal(false);
  hasGtinExemption = signal(true); // defaults to "I don't have a barcode" — the common case here

  submitting = signal(false);
  submitError = signal<string | null>(null);
  // Set when a rejection named attributes this dialog could resolve by adding fields — distinct
  // from submitError so the UI can say "fill these in and retry" rather than a dead-end failure.
  retryNotice = signal<string | null>(null);

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
    this.quantityAttributes.set([]);
    this.unsupportedAttributes.set([]);
    this.attributeSchemas.clear();
    this.retryNotice.set(null);
    this.hasUnitCount.set(false);
    this.hasHsn.set(false);
    this.hasGtinExemptionOption.set(false);

    try {
      const extraNames = [
        ...KNOWN_EXTRA_TEXT_ATTRIBUTES, ...OPTIONAL_TEXT_ATTRIBUTES, ...KNOWN_EXTRA_NUMBER_ATTRIBUTES,
        ...QUANTITY_LIKE_ATTRIBUTES, ...COMPOSITE_SPECIAL_ATTRIBUTES,
      ];
      const schema = await this.marketplaceConnections.getAmazonProductTypeSchema(productType, extraNames);
      const byName = new Map(schema.attributes.map((a) => [a.name, a]));

      const candidateNames = Array.from(new Set([
        ...schema.required,
        ...KNOWN_EXTRA_TEXT_ATTRIBUTES,
        ...OPTIONAL_TEXT_ATTRIBUTES,
        ...KNOWN_EXTRA_NUMBER_ATTRIBUTES,
        ...QUANTITY_LIKE_ATTRIBUTES,
      ])).filter((name) => !BACKEND_MANAGED_ATTRIBUTES.includes(name));

      const { fields, quantities, unsupported } = this.processNames(candidateNames, schema, byName);

      this.hasUnitCount.set(!!byName.get('unit_count'));
      this.hasHsn.set(!!byName.get('external_product_information'));
      this.hasGtinExemptionOption.set(!!byName.get('supplier_declared_has_product_identifier_exemption'));

      this.requiredFields.set(fields);
      this.quantityAttributes.set(quantities);
      this.unsupportedAttributes.set(unsupported);
      this.prefillValues(fields);
    } catch (error) {
      this.schemaError.set((error instanceof Error && error.message) || 'Failed to load requirements for this product type.');
    } finally {
      this.loadingSchema.set(false);
    }
  }

  /** Detects whether an attribute is shaped like a numeric value with a unit — either flat
   * (item_weight: { value, unit }, capacity: { value, unit }) or nested per-axis
   * (item_dimensions: { length: { value, unit }, width: {...}, height: {...} },
   * item_width_height: { height: {...}, width: {...} }). Works from the attribute's own field
   * shape rather than its name, so it generalizes to whatever a given category calls its
   * quantity-style attributes. */
  private detectQuantityAxes(attr: AmazonAttributeSummary): Array<{ key: string; unitOptions: string[] }> {
    const fields = attr.fields || [];
    const topUnit = fields.find((f) => f.name === 'unit' && f.enum?.length);
    const topValue = fields.find((f) => f.name === 'value');
    if (topUnit && topValue) return [{ key: 'value', unitOptions: topUnit.enum!.map(String) }];

    const axes: Array<{ key: string; unitOptions: string[] }> = [];
    for (const field of fields) {
      const nested = field.nestedFields || [];
      const unit = nested.find((n) => n.name === 'unit' && n.enum?.length);
      const value = nested.find((n) => n.name === 'value');
      if (unit && value) axes.push({ key: field.name, unitOptions: unit.enum!.map(String) });
    }
    return axes;
  }

  /** Shared attribute-name -> renderable-field/quantity/unsupported resolution, used both for the
   * proactive fetch on product type selection and for dynamically adding fields Amazon names in a
   * rejection (addMissingAttributes). */
  private processNames(
    names: string[],
    schema: AmazonProductTypeSchema,
    byName: Map<string, AmazonAttributeSummary>,
  ): { fields: RenderableField[]; quantities: QuantityAttribute[]; unsupported: string[] } {
    const fields: RenderableField[] = [];
    const quantities: QuantityAttribute[] = [];
    const unsupported: string[] = [];
    const isNumberAttr = (name: string) => KNOWN_EXTRA_NUMBER_ATTRIBUTES.includes(name);
    const isOptionalAttr = (name: string) => OPTIONAL_TEXT_ATTRIBUTES.includes(name);

    for (const name of names) {
      const attr = byName.get(name);
      if (!attr) {
        // Only the schema's own declared-required fields are hard blockers here — this list is
        // opportunistic (a different product type just may not need them).
        if (schema.required.includes(name)) unsupported.push(name);
        continue;
      }

      const axes = this.detectQuantityAxes(attr);
      if (axes.length > 0) {
        this.attributeSchemas.set(name, attr);
        quantities.push({
          name,
          label: this.labelFor(name),
          axes: axes.map((axis) => ({
            key: axis.key,
            label: axis.key === 'value' ? this.labelFor(name) : this.labelFor(axis.key),
            value: 0,
            unit: axis.unitOptions[0] ?? '',
            unitOptions: axis.unitOptions,
          })),
        });
        continue;
      }

      const valueField = attr.fields?.find((f) => f.name === 'value');
      if (!valueField) {
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

    return { fields, quantities, unsupported };
  }

  /** Called when Amazon rejects a submission naming attributes not currently rendered — fetches
   * their schema and adds whatever can be rendered (fields/quantities) to the live form, so the
   * seller can fill them in and retry without losing anything already entered. Anything that
   * still can't be rendered is folded into unsupportedAttributes regardless of what the generic
   * schema.required says, since a live rejection is stronger evidence than that list. */
  private async addMissingAttributes(names: string[]): Promise<void> {
    const productType = this.selectedProductType();
    if (!productType || names.length === 0) return;

    try {
      const schema = await this.marketplaceConnections.getAmazonProductTypeSchema(productType, names);
      const byName = new Map(schema.attributes.map((a) => [a.name, a]));
      const { fields, quantities, unsupported } = this.processNames(names, schema, byName);

      const handled = new Set([...fields.map((f) => f.name), ...quantities.map((q) => q.name), ...unsupported]);
      const reallyUnsupported = [...unsupported, ...names.filter((name) => !handled.has(name))];

      if (fields.length) {
        this.requiredFields.update((existing) => [...existing, ...fields]);
        this.fieldValues.update((values) => {
          const next = { ...values };
          for (const field of fields) if (!(field.name in next)) next[field.name] = this.defaultValueFor(field);
          return next;
        });
      }
      if (quantities.length) {
        this.quantityAttributes.update((existing) => [...existing, ...quantities]);
      }
      if (reallyUnsupported.length) {
        this.unsupportedAttributes.update((existing) => Array.from(new Set([...existing, ...reallyUnsupported])));
      }
    } catch {
      // The rejection's own message (already surfaced via retryNotice/submitError) is still
      // accurate even if this follow-up schema fetch fails — nothing further to add here.
    }
  }

  private labelFor(name: string): string {
    return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private defaultValueFor(field: RenderableField): string {
    if (field.name === 'item_name') return this.listing.name || '';
    if (field.name === 'brand' || field.name === 'manufacturer') return this.listing.brand || '';
    if (field.name === 'product_description') return this.listing.description || '';
    if (field.options?.includes('IN') && field.name === 'country_of_origin') return 'IN';
    if (field.options?.includes('not_applicable')) return 'not_applicable';
    if (field.kind === 'select' && field.options?.length) return field.options[0];
    if (field.kind === 'number') return '1';
    return '';
  }

  private prefillValues(fields: RenderableField[]): void {
    const values: Record<string, string> = {};
    for (const field of fields) values[field.name] = this.defaultValueFor(field);
    this.fieldValues.set(values);
  }

  setFieldValue(name: string, value: string): void {
    // NumberValueAccessor hands back a real JS number for type="number" inputs (e.g. Number Of
    // Items), not a string — despite $event being typed `any` here so TS doesn't catch it. Coerce
    // at the source so every reader below can safely call .trim() on fieldValues() entries.
    this.fieldValues.update((v) => ({ ...v, [name]: String(value ?? '') }));
  }

  setQuantityAxisValue(attrName: string, axisKey: string, value: number): void {
    this.quantityAttributes.update((list) => list.map((qa) => (
      qa.name !== attrName ? qa : { ...qa, axes: qa.axes.map((a) => (a.key !== axisKey ? a : { ...a, value: Number(value) || 0 })) }
    )));
  }

  setQuantityAxisUnit(attrName: string, axisKey: string, unit: string): void {
    this.quantityAttributes.update((list) => list.map((qa) => (
      qa.name !== attrName ? qa : { ...qa, axes: qa.axes.map((a) => (a.key !== axisKey ? a : { ...a, unit })) }
    )));
  }

  /** Human-readable reasons Publish is disabled — surfaced in the template so a field missed
   * further up the (often long) form doesn't look like an unexplained stuck button. */
  missingFields(): string[] {
    if (!this.selectedProductType() || (this.requiredFields().length === 0 && this.quantityAttributes().length === 0)) return [];
    if (this.unsupportedAttributes().length > 0) return ['Unsupported attributes: ' + this.unsupportedAttributes().join(', ')];

    const values = this.fieldValues();
    const missing = this.requiredFields()
      .filter((field) => !field.optional && (values[field.name] || '').trim().length === 0)
      .map((field) => field.label);

    for (const qa of this.quantityAttributes()) {
      for (const axis of qa.axes) {
        if (!(axis.value > 0)) missing.push(qa.axes.length > 1 ? `${qa.label} ${axis.label}` : qa.label);
      }
    }

    if (this.hasHsn() && this.hsnCode().trim().length === 0) missing.push('HSN code');
    if (this.hasGtinExemptionOption() && !this.hasGtinExemption()) missing.push('GTIN/UPC/EAN exemption checkbox');
    return missing;
  }

  isValid(): boolean {
    if (!this.selectedProductType()) return false;
    if (this.requiredFields().length === 0 && this.quantityAttributes().length === 0) return false;
    if (this.unsupportedAttributes().length > 0) return false;
    return this.missingFields().length === 0;
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  async submit(): Promise<void> {
    if (!this.isValid() || !this.listing.id) return;
    this.submitting.set(true);
    this.submitError.set(null);
    this.retryNotice.set(null);

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

    for (const qa of this.quantityAttributes()) {
      if (qa.axes.length === 1 && qa.axes[0].key === 'value') {
        attributes[qa.name] = [{ value: qa.axes[0].value, unit: qa.axes[0].unit }];
      } else {
        const shaped: Record<string, unknown> = {};
        for (const axis of qa.axes) shaped[axis.key] = { value: axis.value, unit: axis.unit };
        attributes[qa.name] = [shaped];
      }
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
      await this.handleSubmitError(error);
    } finally {
      this.submitting.set(false);
    }
  }

  /** On rejection, tries to recover by adding fields for whatever Amazon named as "required but
   * missing" that this dialog doesn't already render — so hitting a brand-new product type's
   * undeclared requirements is a fill-in-and-retry loop instead of a dead end. Falls back to
   * showing the plain error when there's nothing new and fixable to add (a value-format problem,
   * or a rejection naming only backend-managed attributes like purchasable_offer). */
  private async handleSubmitError(error: unknown): Promise<void> {
    const fallbackMessage = (error instanceof Error && error.message) || 'Failed to create the Amazon listing. Please try again.';
    const issues = (error as ApiError | null)?.data as { issues?: AmazonListingIssue[] } | undefined;
    const allIssues = issues?.issues;

    if (!allIssues?.length) {
      this.submitError.set(fallbackMessage);
      return;
    }

    const knownNames = new Set([
      ...this.requiredFields().map((f) => f.name),
      ...this.quantityAttributes().map((q) => q.name),
      ...COMPOSITE_SPECIAL_ATTRIBUTES,
    ]);

    const newlyMissingNames = Array.from(new Set(
      allIssues
        .filter((issue) => /required but missing/i.test(issue.message || ''))
        .flatMap((issue) => issue.attributeNames || [])
        .filter((name) => !BACKEND_MANAGED_ATTRIBUTES.includes(name) && !knownNames.has(name)),
    ));

    const unresolvableIssues = allIssues.filter((issue) => issue.attributeNames?.some((n) => BACKEND_MANAGED_ATTRIBUTES.includes(n)));

    if (newlyMissingNames.length === 0) {
      this.submitError.set(fallbackMessage);
      return;
    }

    await this.addMissingAttributes(newlyMissingNames);
    const extra = unresolvableIssues.length ? ` (Also unresolved: ${unresolvableIssues.map((i) => i.message).filter(Boolean).join('; ')})` : '';
    this.retryNotice.set('Amazon needs more details for this product type — fill in the highlighted field(s) below and try again.' + extra);
  }
}
