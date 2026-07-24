import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { WorkspaceStateService } from '../../state/workspace-state.service';
import { AIListingService } from '../../services/ai-listing.service';
import { AttributeService } from '../../services/attribute.service';
import { AttributeCard } from '../../components/attribute-card/attribute-card';
import { EditableTextArea } from '../../components/editable-textarea/editable-textarea';
import { KeywordChips } from '../../components/keyword-chips/keyword-chips';
import { Attribute } from '../../models/category.model';
import { getPath, setPath } from '../../utils/field-path.util';

interface FieldConfig {
  path: string;
  label: string;
  kind: 'text' | 'longtext' | 'array';
}

const FIELDS: FieldConfig[] = [
  { path: 'marketplaceListings.meesho.title', label: 'Title', kind: 'text' },
  { path: 'marketplaceListings.meesho.description', label: 'Description', kind: 'longtext' },
  { path: 'marketplaceListings.meesho.highlights', label: 'Highlights', kind: 'array' },
  { path: 'marketplaceListings.meesho.material', label: 'Material', kind: 'text' },
  { path: 'marketplaceListings.meesho.color', label: 'Color', kind: 'text' },
  { path: 'marketplaceListings.meesho.fabric', label: 'Fabric', kind: 'text' },
  { path: 'marketplaceListings.meesho.pattern', label: 'Pattern', kind: 'text' },
  { path: 'marketplaceListings.meesho.fit', label: 'Fit', kind: 'text' },
  { path: 'marketplaceListings.meesho.occasion', label: 'Occasion', kind: 'text' },
  { path: 'marketplaceListings.meesho.netQuantity', label: 'Net Quantity', kind: 'text' },
  { path: 'marketplaceListings.meesho.packOf', label: 'Pack Of', kind: 'text' },
  { path: 'marketplaceListings.meesho.weight', label: 'Weight', kind: 'text' },
  { path: 'marketplaceListings.meesho.dispatchTime', label: 'Dispatch Time', kind: 'text' },
  { path: 'marketplaceListings.meesho.packageContents', label: 'Package Contents', kind: 'text' },
];

@Component({
  selector: 'app-meesho-listing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AttributeCard, EditableTextArea, KeywordChips],
  templateUrl: './meesho-listing.html',
})
export class MeeshoListing {
  workspaceState = inject(WorkspaceStateService);
  private aiListingService = inject(AIListingService);
  private attributeService = inject(AttributeService);

  fields = FIELDS;
  regeneratingPath = signal<string | null>(null);

  categoryAttributes = computed(() => {
    const product = this.workspaceState.product();
    if (!product) return [];
    return this.attributeService.getAttributesFor(product.classification.category, product.classification.subCategory, 'meesho');
  });

  asAttribute(field: FieldConfig): Attribute {
    return { id: field.path, label: field.label, type: 'string', required: false, marketplaces: ['meesho'] };
  }

  getText(field: FieldConfig): string {
    const product = this.workspaceState.product();
    const raw = product ? getPath(product, field.path) : '';
    return raw == null ? '' : String(raw);
  }

  getArray(field: FieldConfig): string[] {
    const product = this.workspaceState.product();
    return (product ? (getPath(product, field.path) as string[]) : []) ?? [];
  }

  getCategoryAttributeValue(attr: Attribute): string {
    return this.workspaceState.product()?.dynamicAttributes?.['meesho']?.[attr.id] ?? '';
  }

  setCategoryAttributeValue(attr: Attribute, value: string) {
    this.workspaceState.update(p => ({
      ...p,
      dynamicAttributes: {
        ...p.dynamicAttributes,
        meesho: { ...(p.dynamicAttributes['meesho'] ?? {}), [attr.id]: value },
      },
    }));
  }

  setValue(field: FieldConfig, value: string | string[]) {
    this.workspaceState.update(p => setPath(p, field.path, value));
  }

  async regenerate(field: FieldConfig) {
    const current = field.kind === 'array' ? this.getArray(field) : this.getText(field);
    this.regeneratingPath.set(field.path);
    try {
      const result = await this.aiListingService.regenerateMock(current);
      this.workspaceState.update(p => setPath(p, field.path, result));
    } finally {
      this.regeneratingPath.set(null);
    }
  }
}
