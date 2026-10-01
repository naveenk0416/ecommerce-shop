import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
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
import { AssistsLeft, AutofillField, isBlockedAiField, WalletService } from '../../../services/wallet';
import { LanguageService } from '../../../services/language';
import { ConfirmActionData, ConfirmActionDialog } from '../confirm-action-dialog';
import { hasRealVariants, variantLabel } from '../../../config/size-presets';
import { AmazonChildResult } from '../../../services/marketplace-connections';

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

/** One input within a "composite object" attribute — a required sub-field that's either a bare
 * leaf (number/string) or a text value wrapped as { value, language_tag } (Amazon's common shape
 * for localized text sub-fields, e.g. stones[].type). */
interface CompositeSubField {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select';
  options?: string[];
  value: string;
  needsLanguageTag: boolean;
}

/** An attribute whose value is an array of objects with several named required sub-fields — e.g.
 * jewelry's `stones` (id, type, creation_method, treatment_method per stone). Rendered as one
 * instance (one object in the array) with an input per required sub-field, detected from the
 * schema's own itemRequired + fields shape rather than hardcoded per attribute name. */
interface CompositeAttribute {
  name: string;
  label: string;
  subFields: CompositeSubField[];
}

// Amazon's own declared schema.required for a product type is known to be incomplete — its real
// submission-time validation enforces more, and which extra attributes are required varies by
// category (confirmed empirically: EARRING/HAIR_CARE needed color/hair_type/lifestyle/etc.;
// HAIR_CLIP needed nothing extra once purchasable_offer was fixed; BOTTLE needed
// model_number/material/capacity/etc.; jewelry needed gem_type/clasp_type/stones/etc. — a
// different set every time). These are the ones found so far that render as simple text/number
// inputs — kept as a head start fetched proactively so the common cases don't need a failed
// submit first; anything else Amazon names in a rejection gets added on the fly by
// addMissingAttributes() below.
const KNOWN_EXTRA_TEXT_ATTRIBUTES = [
  'color', 'manufacturer', 'part_number', 'target_audience_keyword', 'generic_keyword',
  'item_type_name', 'packer_contact_information', 'rtip_manufacturer_contact_information',
  'hair_type', 'lifestyle',
  // Not always in a product type's declared schema.required, but Seller Central still shows the
  // listing as incomplete ("Item Condition" flagged mandatory on the Offer page) without it, since
  // it's needed to actually make the offer sellable rather than just to satisfy schema validation
  // — so this is fetched proactively rather than waiting for a live rejection to name it.
  'condition_type',
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
// distinct from the generic quantity/composite-object detection, so kept as dedicated fields.
const COMPOSITE_SPECIAL_ATTRIBUTES = [
  'unit_count', 'external_product_information', 'supplier_declared_has_product_identifier_exemption',
  'externally_assigned_product_identifier',
];
// Never form-fillable — fully backend-computed (price/quantity, and the image URL served by the
// backend), so a rejection naming these can't be resolved by adding an input field.
const BACKEND_MANAGED_ATTRIBUTES = ['purchasable_offer', 'fulfillment_availability', 'main_product_image_locator'];
// Structural keys that can show up in itemRequired but aren't meant to be individually rendered
// (marketplace_id is auto-filled server-side context, language_tag is folded into whichever
// sub-field needs it rather than being its own input).
const NON_RENDERABLE_REQUIRED_KEYS = new Set(['marketplace_id', 'language_tag']);

@Component({
  selector: 'app-create-amazon-listing-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatCheckboxModule, MatProgressSpinnerModule, MatDialogModule, MatTooltipModule],
  templateUrl: './create-amazon-listing-dialog.html',
  styleUrl: './create-amazon-listing-dialog.scss',
})
export class CreateAmazonListingDialog {
  private readonly dialogRef = inject(MatDialogRef<CreateAmazonListingDialog, boolean>);
  private readonly marketplaceConnections = inject(MarketplaceConnectionsService);
  private readonly wallet = inject(WalletService);
  private readonly dialog = inject(MatDialog);
  protected readonly i18n = inject(LanguageService);
  protected readonly listing = inject<Listing>(MAT_DIALOG_DATA as any); // eslint-disable-line @typescript-eslint/no-explicit-any

  // ---- Sizes & colours: 1 parent + 1 child listing per size ----
  readonly sizes = hasRealVariants(this.listing.variants) ? this.listing.variants! : [];
  readonly sizeLabels = this.sizes.map(variantLabel);
  /** Test push: SA-TEST SKUs, every size at stock 0, so nothing is buyable. */
  testPush = signal(false);
  /** Per-size problems from our schema check, Amazon's validation, or the push itself. */
  childErrors = signal<AmazonChildResult[]>([]);

  // ---- "Fill empty fields with AI" (free, limited per product per marketplace and per day) ----
  aiAssists = signal<AssistsLeft | null>(null);
  aiLimit = signal<'item' | 'day' | null>(null);
  /** Fields the AI filled that the seller hasn't edited or confirmed yet (shown with a "✨ AI" badge). */
  aiFilled = signal<ReadonlySet<string>>(new Set());
  /** Once the AI filled anything, Publish needs the "I've reviewed…" tick. */
  aiUsed = signal(false);
  reviewedAi = signal(false);
  aiFillNotice = signal<string | null>(null);
  /** Fields the seller typed in — the AI never overwrites them. */
  private touched = new Set<string>();

  aiButtonLabel = computed(() => {
    const left = this.aiAssists()?.left;
    const base = this.i18n.t('Fill empty fields with AI', 'खाली fields AI से भरें');
    return left === undefined ? base : `${base} · ${left} ${this.i18n.t('left', 'बाकी')}`;
  });

  aiButtonTooltip = computed(() => {
    if (this.aiLimit() === 'day') return this.i18n.t('Daily free AI limit reached — try again tomorrow.', 'आज की free AI limit पूरी हो गई — कल फिर कोशिश करें।');
    if (this.aiLimit() === 'item' || this.aiAssists()?.left === 0) return this.i18n.t('Free AI limit reached for this product on Amazon.', 'Amazon पर इस product के लिए free AI limit पूरी हो गई।');
    return this.i18n.t('Free — fills only empty descriptive fields. No coins used.', 'Free — सिर्फ़ खाली descriptive fields भरता है। कोई coin नहीं लगेगा।');
  });

  aiButtonDisabled = computed(() => this.aiFilling() || this.aiLimit() !== null || this.aiAssists()?.left === 0);

  /** Amazon only accepts "Generic" as a brand in some cases. */
  brandWarning = computed(() => {
    if (!this.requiredFields().some((f) => f.name === 'brand')) return false;
    const brand = (this.fieldValues()['brand'] || '').trim();
    return !brand || /^generic$/i.test(brand);
  });

  keywords = signal(this.listing.category || this.listing.name || '');
  searching = signal(false);
  searchError = signal<string | null>(null);
  productTypes = signal<AmazonProductType[]>([]);

  selectedProductType = signal<string | null>(null);
  loadingSchema = signal(false);
  schemaError = signal<string | null>(null);
  requiredFields = signal<RenderableField[]>([]);
  quantityAttributes = signal<QuantityAttribute[]>([]);
  compositeAttributes = signal<CompositeAttribute[]>([]);
  unsupportedAttributes = signal<string[]>([]);
  fieldValues = signal<Record<string, string>>({});

  hasUnitCount = signal(false);
  hasHsn = signal(false);
  hsnCode = signal(this.listing.hsnCode || '');
  hasGtinExemptionOption = signal(false);
  hasGtinExemption = signal(true); // defaults to "I don't have a barcode" — the common case here

  aiFilling = signal(false);
  aiFillError = signal<string | null>(null);

  submitting = signal(false);
  submitError = signal<string | null>(null);
  // Set when a rejection named attributes this dialog could resolve by adding fields — distinct
  // from submitError so the UI can say "fill these in and retry" rather than a dead-end failure.
  retryNotice = signal<string | null>(null);

  /** Full schema summaries for the fields being rendered — kept alongside requiredFields so
   * submit() can check itemRequired (e.g. whether language_tag belongs in the value) without
   * re-fetching. */
  private attributeSchemas = new Map<string, AmazonAttributeSummary>();

  constructor() {
    void this.loadAiAssists();
    if (!this.wallet.wallet()) void this.wallet.load();
  }

  private async loadAiAssists(): Promise<void> {
    if (!this.listing.id) return;
    try {
      const assists = await this.wallet.assists('marketplace_autofill', this.listing.id, 'amazon');
      this.aiAssists.set(assists);
      this.aiLimit.set(assists.dayLeft <= 0 ? 'day' : assists.left <= 0 ? 'item' : null);
    } catch {
      // Count unavailable — the button still works and the server enforces the limit.
    }
  }

  /** Manufacturer, origin, MRP, weight, dimensions, GTIN, brand, compliance … — entered by the seller only. */
  isBlocked(name: string, label = ''): boolean {
    return isBlockedAiField(name, label, this.wallet.wallet()?.blockedFieldPatterns ?? []);
  }

  /** "Required — please enter" under empty fields the AI never fills. */
  needsSellerInput(field: RenderableField): boolean {
    return !field.optional && this.isBlocked(field.name, field.label) && !(this.fieldValues()[field.name] || '').trim();
  }

  compositeNeedsSellerInput(ca: CompositeAttribute, sf: CompositeSubField): boolean {
    return this.isBlocked(`${ca.name}_${sf.key}`, `${ca.label} ${sf.label}`) && !sf.value.trim();
  }

  isAiFilled(key: string): boolean {
    return this.aiFilled().has(key);
  }

  /** "Looks right" — the seller confirms an AI value without editing it. */
  confirmAiValue(key: string): void {
    this.aiFilled.update((set) => {
      const next = new Set(set);
      next.delete(key);
      return next;
    });
  }

  private markTouched(key: string): void {
    this.touched.add(key);
    this.confirmAiValue(key);
  }

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
    this.compositeAttributes.set([]);
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

      const { fields, quantities, composites, unsupported } = this.processNames(candidateNames, schema, byName);

      this.hasUnitCount.set(!!byName.get('unit_count'));
      this.hasHsn.set(!!byName.get('external_product_information'));
      this.hasGtinExemptionOption.set(!!byName.get('supplier_declared_has_product_identifier_exemption'));

      this.requiredFields.set(fields);
      this.quantityAttributes.set(quantities);
      this.compositeAttributes.set(composites);
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

  /** Detects whether an attribute is an array of objects with several named required sub-fields
   * (e.g. stones[]: { id, type: { value, language_tag }, creation_method: {...}, ... }) — one
   * input per itemRequired key, typed from that key's own field shape. Returns null (defer to
   * "unsupported") if any required sub-field has a shape this dialog doesn't know how to render
   * (e.g. a nested array of its own), so it never silently submits something wrong. */
  private detectCompositeSubFields(attr: AmazonAttributeSummary): CompositeSubField[] | null {
    const requiredKeys = (attr.itemRequired || []).filter((key) => !NON_RENDERABLE_REQUIRED_KEYS.has(key));
    if (requiredKeys.length === 0) return null;

    const fields = attr.fields || [];
    const subFields: CompositeSubField[] = [];
    for (const key of requiredKeys) {
      const field = fields.find((f) => f.name === key);
      if (!field) return null;

      if (field.nestedFields?.length) {
        const valueField = field.nestedFields.find((n) => n.name === 'value');
        if (!valueField) return null;
        const options = valueField.enum?.map(String);
        subFields.push({
          key,
          label: this.labelFor(key),
          kind: options?.length ? 'select' : 'text',
          options,
          value: options?.length ? options[0] : '',
          needsLanguageTag: field.nestedFields.some((n) => n.name === 'language_tag'),
        });
      } else if (field.type === 'integer' || field.type === 'number') {
        subFields.push({ key, label: this.labelFor(key), kind: 'number', value: '', needsLanguageTag: false });
      } else if (field.type === 'string') {
        const options = field.enum?.map(String);
        subFields.push({
          key,
          label: this.labelFor(key),
          kind: options?.length ? 'select' : 'text',
          options,
          value: options?.length ? options[0] : '',
          needsLanguageTag: false,
        });
      } else {
        return null;
      }
    }
    return subFields;
  }

  /** Shared attribute-name -> renderable-field/quantity/composite/unsupported resolution, used
   * both for the proactive fetch on product type selection and for dynamically adding fields
   * Amazon names in a rejection (addMissingAttributes). */
  private processNames(
    names: string[],
    schema: AmazonProductTypeSchema,
    byName: Map<string, AmazonAttributeSummary>,
  ): { fields: RenderableField[]; quantities: QuantityAttribute[]; composites: CompositeAttribute[]; unsupported: string[] } {
    const fields: RenderableField[] = [];
    const quantities: QuantityAttribute[] = [];
    const composites: CompositeAttribute[] = [];
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
        const compositeSubFields = this.detectCompositeSubFields(attr);
        if (compositeSubFields) {
          this.attributeSchemas.set(name, attr);
          composites.push({ name, label: this.labelFor(name), subFields: compositeSubFields });
          continue;
        }
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

    return { fields, quantities, composites, unsupported };
  }

  /** Called when Amazon rejects a submission naming attributes not currently rendered — fetches
   * their schema and adds whatever can be rendered (fields/quantities/composites) to the live
   * form, so the seller can fill them in and retry without losing anything already entered.
   * Anything that still can't be rendered is folded into unsupportedAttributes regardless of what
   * the generic schema.required says, since a live rejection is stronger evidence than that list.
   * Re-processes fresh each time, so a name previously marked unsupported gets a clean second
   * chance rather than staying stuck. */
  private async addMissingAttributes(names: string[]): Promise<void> {
    const productType = this.selectedProductType();
    if (!productType || names.length === 0) return;

    this.unsupportedAttributes.update((existing) => existing.filter((name) => !names.includes(name)));

    try {
      const schema = await this.marketplaceConnections.getAmazonProductTypeSchema(productType, names);
      const byName = new Map(schema.attributes.map((a) => [a.name, a]));
      const { fields, quantities, composites, unsupported } = this.processNames(names, schema, byName);

      const handled = new Set([
        ...fields.map((f) => f.name), ...quantities.map((q) => q.name), ...composites.map((c) => c.name), ...unsupported,
      ]);
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
      if (composites.length) {
        this.compositeAttributes.update((existing) => [...existing, ...composites]);
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
    if (field.name === 'brand') return this.listing.brand || '';
    if (field.name === 'product_description') return this.listing.description || '';
    if (field.name === 'condition_type' && field.options?.includes('new_new')) return 'new_new';
    // Manufacturer, origin, MRP, compliance … are never pre-filled or AI-filled — the seller enters them.
    if (this.isBlocked(field.name, field.label)) return '';
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
    this.markTouched(name);
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

  setCompositeSubFieldValue(attrName: string, key: string, value: string): void {
    // Same NumberValueAccessor caveat as setFieldValue — a 'number' kind sub-field can hand back
    // a real number here despite $event being typed `any`, so coerce to string at the source.
    this.compositeAttributes.update((list) => list.map((ca) => (
      ca.name !== attrName ? ca : { ...ca, subFields: ca.subFields.map((sf) => (sf.key !== key ? sf : { ...sf, value: String(value ?? '') })) }
    )));
    this.markTouched(`${attrName}__${key}`);
  }

  /** Human-readable reasons Publish is disabled — surfaced in the template so a field missed
   * further up the (often long) form doesn't look like an unexplained stuck button. */
  missingFields(): string[] {
    const nothingLoaded = this.requiredFields().length === 0 && this.quantityAttributes().length === 0 && this.compositeAttributes().length === 0;
    if (!this.selectedProductType() || nothingLoaded) return [];
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

    for (const ca of this.compositeAttributes()) {
      for (const sf of ca.subFields) {
        if (!sf.value.trim()) missing.push(`${ca.label} ${sf.label}`);
      }
    }

    if (this.hasHsn() && this.hsnCode().trim().length === 0) missing.push('HSN code');
    if (this.hasGtinExemptionOption() && !this.hasGtinExemption()) missing.push('GTIN/UPC/EAN exemption checkbox');
    if (this.aiUsed() && !this.reviewedAi()) missing.push(this.i18n.t('tick "I\'ve reviewed the AI-filled details"', '"मैंने AI से भरी details जांच ली हैं" पर tick करें'));
    return missing;
  }

  isValid(): boolean {
    if (!this.selectedProductType()) return false;
    if (this.requiredFields().length === 0 && this.quantityAttributes().length === 0 && this.compositeAttributes().length === 0) return false;
    if (this.unsupportedAttributes().length > 0) return false;
    return this.missingFields().length === 0;
  }

  hasFillableFields(): boolean {
    return this.requiredFields().length > 0 || this.quantityAttributes().length > 0 || this.compositeAttributes().length > 0;
  }

  /**
   * "Fill empty fields with AI": free (no coins), limited per product and per day. Only fields the
   * seller left empty (or still at their automatic default) and that aren't on the blocked list are
   * sent — measurements, MRP, origin, manufacturer, GTIN, brand and compliance fields never are,
   * and the server drops them again anyway. Filled fields get a "✨ AI" badge until edited or
   * confirmed, and Publish then needs the "I've reviewed…" tick.
   */
  async fillWithAi(): Promise<void> {
    if (this.aiButtonDisabled() || !this.hasFillableFields() || !this.listing.id) return;
    const values = this.fieldValues();
    const fields: AutofillField[] = [];
    for (const field of this.requiredFields()) {
      if (this.touched.has(field.name) || this.isBlocked(field.name, field.label)) continue;
      const current = (values[field.name] || '').trim();
      const isDefault = field.kind === 'select' && current === this.defaultValueFor(field);
      if (current && !isDefault) continue;
      fields.push({ key: field.name, label: field.label, kind: field.kind, options: field.options });
    }
    for (const ca of this.compositeAttributes()) {
      for (const sf of ca.subFields) {
        const key = `${ca.name}__${sf.key}`;
        if (this.touched.has(key) || this.isBlocked(`${ca.name}_${sf.key}`, `${ca.label} ${sf.label}`)) continue;
        if (sf.value.trim() && !(sf.kind === 'select' && sf.value === (sf.options?.[0] ?? ''))) continue;
        fields.push({ key, label: `${ca.label} ${sf.label}`, kind: sf.kind === 'number' ? 'number' : sf.kind === 'select' ? 'select' : 'text', options: sf.options });
      }
    }
    if (fields.length === 0) {
      this.aiFillNotice.set(this.i18n.t('Nothing to fill — the remaining empty fields must be entered by you.', 'भरने के लिए कुछ नहीं — बाकी खाली fields आपको खुद भरने होंगे।'));
      return;
    }

    this.aiFilling.set(true);
    this.aiFillError.set(null);
    this.aiFillNotice.set(null);
    try {
      const result = await this.wallet.marketplaceAutofill(this.listing.id, 'amazon', fields);
      this.aiAssists.set(result.assists);
      this.aiLimit.set(result.assists.dayLeft <= 0 ? 'day' : result.assists.left <= 0 ? 'item' : null);
      const filled = new Set(this.aiFilled());
      this.fieldValues.update((current) => {
        const next = { ...current };
        for (const field of this.requiredFields()) {
          const value = result.values[field.name];
          if (value === undefined || this.touched.has(field.name)) continue;
          next[field.name] = String(value);
          filled.add(field.name);
        }
        return next;
      });
      this.compositeAttributes.update((list) => list.map((ca) => ({
        ...ca,
        subFields: ca.subFields.map((sf) => {
          const key = `${ca.name}__${sf.key}`;
          const value = result.values[key];
          if (value === undefined || this.touched.has(key)) return sf;
          filled.add(key);
          return { ...sf, value: String(value) };
        }),
      })));
      this.aiFilled.set(filled);
      if (filled.size > 0) {
        this.aiUsed.set(true);
        this.reviewedAi.set(false);
      }
      const count = filled.size;
      this.aiFillNotice.set(count
        ? this.i18n.t(`AI filled ${count} field${count === 1 ? '' : 's'} — check each one marked ✨ AI.`, `AI ने ${count} fields भरे — ✨ AI वाले हर field को जांचें।`)
        : this.i18n.t('The AI wasn\'t sure about any empty field — please fill them in yourself.', 'AI किसी खाली field के बारे में पक्का नहीं था — कृपया खुद भरें।'));
    } catch (error) {
      const data = (error as ApiError).data as { code?: string; limit?: 'item' | 'day'; assists?: AssistsLeft } | undefined;
      if (data?.assists) this.aiAssists.set(data.assists);
      if (data?.code === 'ASSIST_LIMIT') this.aiLimit.set(data.limit ?? 'item');
      this.aiFillError.set((error instanceof Error && error.message) || this.i18n.t('AI fill failed. Please try again.', 'AI से भरना नहीं हो पाया। फिर से कोशिश करें।'));
    } finally {
      this.aiFilling.set(false);
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  async submit(): Promise<void> {
    if (!this.isValid() || !this.listing.id) return;
    const confirmed = await firstValueFrom(this.dialog.open<ConfirmActionDialog, ConfirmActionData, boolean>(ConfirmActionDialog, {
      width: '480px',
      maxWidth: '95vw',
      data: {
        title: this.sizes.length && this.testPush() ? 'Test push to Amazon?' : 'Publish to Amazon?',
        intro: this.sizes.length
          ? (this.testPush()
            ? `This creates 1 parent + ${this.sizes.length} sizes with SA-TEST SKUs and stock 0 — they stay inactive.`
            : `This creates 1 parent + ${this.sizes.length} sizes (${this.sizeLabels.join(', ')}) as new listings on your Amazon account.`)
          : 'This creates a new, live listing on your Amazon seller account.',
        items: [{
          heading: this.listing.name || 'This product',
          lines: [
            `Product type: ${this.selectedProductType()}`,
            `Price ₹${this.listing.sellingPrice || 0} · MRP ₹${this.listing.mrp || this.listing.sellingPrice || 0} · Stock ${this.listing.quantity ?? 0}`,
            ...(this.aiUsed() ? ['Includes AI-filled details you reviewed'] : []),
          ],
        }],
        confirmLabel: 'Publish to Amazon',
        warning: 'Amazon shows this listing to buyers once it is accepted.',
      },
    }).afterClosed());
    if (!confirmed) return;
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

    for (const ca of this.compositeAttributes()) {
      const shaped: Record<string, unknown> = {};
      for (const sf of ca.subFields) {
        const raw = sf.value.trim();
        shaped[sf.key] = sf.kind === 'number' ? (Number(raw) || 0) : (sf.needsLanguageTag ? { value: raw, language_tag: 'en_IN' } : raw);
      }
      attributes[ca.name] = [shaped];
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
    this.childErrors.set([]);

    try {
      if (this.sizes.length) {
        const result = await this.marketplaceConnections.createAmazonVariations(this.listing.id, { ...payload, test: this.testPush() });
        const failed = result.children.filter((c) => c.ok === false);
        if (failed.length) {
          this.childErrors.set(failed);
          this.submitError.set(`${result.children.length - failed.length} of ${result.children.length} sizes were created. Fix the sizes below and try again.`);
          return;
        }
      } else {
        await this.marketplaceConnections.createAmazonListing(this.listing.id, payload);
      }
      this.dialogRef.close(true);
    } catch (error) {
      const data = (error as ApiError | null)?.data as { childErrors?: AmazonChildResult[] } | undefined;
      if (data?.childErrors?.length) {
        this.childErrors.set(data.childErrors);
        this.submitError.set((error instanceof Error && error.message) || 'Amazon found problems — nothing was published.');
        return;
      }
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
      ...this.compositeAttributes().map((c) => c.name),
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
