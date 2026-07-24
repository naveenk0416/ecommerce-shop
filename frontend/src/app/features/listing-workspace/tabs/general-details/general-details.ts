import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowUndo, arrowRedo, cloudDone, cloudUpload } from 'ionicons/icons';
import { WorkspaceStateService } from '../../state/workspace-state.service';
import { AIListingService, FieldValueType } from '../../services/ai-listing.service';
import { AttributeCard } from '../../components/attribute-card/attribute-card';
import { EditableTextArea } from '../../components/editable-textarea/editable-textarea';
import { KeywordChips } from '../../components/keyword-chips/keyword-chips';
import { Attribute } from '../../models/category.model';
import { getPath, setPath } from '../../utils/field-path.util';

type FieldKind = 'text' | 'number' | 'longtext' | 'array';

interface FieldConfig {
  path: string;
  label: string;
  kind: FieldKind;
  customPrompt?: string;
}

interface FieldSection {
  title: string;
  fields: FieldConfig[];
}

const SECTIONS: FieldSection[] = [
  {
    title: 'Identity & Classification',
    fields: [
      { path: 'basicInformation.productName', label: 'Product Name', kind: 'text' },
      { path: 'basicInformation.brand', label: 'Brand', kind: 'text' },
      { path: 'basicInformation.sku', label: 'SKU', kind: 'text' },
      { path: 'basicInformation.internalProductId', label: 'Internal Product ID', kind: 'text' },
      { path: 'classification.category', label: 'Category', kind: 'text' },
      { path: 'classification.subCategory', label: 'Sub Category', kind: 'text' },
      { path: 'classification.productType', label: 'Product Type', kind: 'text' },
      { path: 'basicInformation.manufacturer', label: 'Manufacturer', kind: 'text' },
      { path: 'basicInformation.importer', label: 'Importer', kind: 'text' },
      { path: 'basicInformation.packer', label: 'Packer', kind: 'text' },
      { path: 'basicInformation.genericName', label: 'Generic Name', kind: 'text', customPrompt: 'A generic (non-branded) product name for regulatory labelling' },
      { path: 'basicInformation.modelNumber', label: 'Model Number', kind: 'text' },
      { path: 'basicInformation.countryOfOrigin', label: 'Country Of Origin', kind: 'text' },
    ],
  },
  {
    title: 'Tax & Pricing',
    fields: [
      { path: 'taxation.hsnCode', label: 'HSN Code', kind: 'text', customPrompt: 'Accurate 6 or 8 digit Indian HSN code based on product category' },
      { path: 'taxation.gstPercentage', label: 'GST %', kind: 'number' },
      { path: 'pricing.sellingPrice', label: 'Selling Price', kind: 'number' },
      { path: 'pricing.mrp', label: 'MRP', kind: 'number' },
      { path: 'pricing.costPrice', label: 'Cost Price', kind: 'number' },
      { path: 'pricing.discountPercent', label: 'Discount %', kind: 'number' },
      { path: 'pricing.estimatedMarketplaceFee', label: 'Marketplace Fee', kind: 'number' },
      { path: 'pricing.shippingCost', label: 'Shipping Cost', kind: 'number' },
      { path: 'pricing.profitMargin', label: 'Profit Margin %', kind: 'number' },
      { path: 'pricing.estimatedProfit', label: 'Expected Profit', kind: 'number' },
    ],
  },
  {
    title: 'Inventory & Physical Attributes',
    fields: [
      { path: 'inventory.stockQuantity', label: 'Stock Quantity', kind: 'number' },
      { path: 'inventory.minimumStock', label: 'Minimum Stock Alert', kind: 'number' },
      { path: 'physicalAttributes.weight', label: 'Weight', kind: 'text' },
      { path: 'physicalAttributes.length', label: 'Length', kind: 'text' },
      { path: 'physicalAttributes.width', label: 'Width', kind: 'text' },
      { path: 'physicalAttributes.height', label: 'Height', kind: 'text' },
      { path: 'physicalAttributes.packageContents', label: 'Package Contents', kind: 'longtext' },
    ],
  },
  {
    title: 'Images & Media',
    fields: [
      { path: 'images.mainImage', label: 'Main Image URL', kind: 'text' },
      { path: 'images.video', label: 'Video URL', kind: 'text' },
      { path: 'images.altText', label: 'Alt Text', kind: 'text' },
      { path: 'images.seoImageName', label: 'SEO Image Name', kind: 'text' },
      { path: 'images.galleryImages', label: 'Gallery Images', kind: 'array' },
      { path: 'images.lifestyleImages', label: 'Lifestyle Images', kind: 'array' },
    ],
  },
];

@Component({
  selector: 'app-general-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, AttributeCard, EditableTextArea, KeywordChips],
  templateUrl: './general-details.html',
})
export class GeneralDetails {
  workspaceState = inject(WorkspaceStateService);
  private aiListingService = inject(AIListingService);

  sections = SECTIONS;
  regeneratingPath = signal<string | null>(null);

  constructor() {
    addIcons({ 'arrow-undo': arrowUndo, 'arrow-redo': arrowRedo, 'cloud-done': cloudDone, 'cloud-upload': cloudUpload });
  }

  asAttribute(field: FieldConfig): Attribute {
    return { id: field.path, label: field.label, type: 'string', required: false, marketplaces: [] };
  }

  getText(field: FieldConfig): string {
    const product = this.workspaceState.product();
    if (!product) return '';
    const raw = getPath(product, field.path);
    return raw == null ? '' : String(raw);
  }

  getArray(field: FieldConfig): string[] {
    const product = this.workspaceState.product();
    if (!product) return [];
    return (getPath(product, field.path) as string[]) ?? [];
  }

  setValue(field: FieldConfig, value: string | string[]) {
    const parsed = field.kind === 'number' ? Number(value) || 0 : value;
    this.workspaceState.update(p => setPath(p, field.path, parsed));
  }

  async regenerate(field: FieldConfig) {
    const product = this.workspaceState.product();
    if (!product) return;
    this.regeneratingPath.set(field.path);
    try {
      const valueType: FieldValueType = field.kind === 'array' ? 'array' : 'string';
      const result = await this.aiListingService.regenerateField(product, field.label, valueType, field.customPrompt);
      this.workspaceState.update(p => setPath(p, field.path, result));
    } catch (err) {
      console.error('Regenerate failed for', field.path, err);
    } finally {
      this.regeneratingPath.set(null);
    }
  }
}
