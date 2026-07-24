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
  { path: 'marketplaceListings.flipkart.seoTitle', label: 'SEO Title', kind: 'text' },
  { path: 'marketplaceListings.flipkart.description', label: 'Description', kind: 'longtext' },
  { path: 'marketplaceListings.flipkart.highlights', label: 'Highlights', kind: 'array' },
  { path: 'marketplaceListings.flipkart.brand', label: 'Brand', kind: 'text' },
  { path: 'marketplaceListings.flipkart.model', label: 'Model', kind: 'text' },
  { path: 'marketplaceListings.flipkart.color', label: 'Color', kind: 'text' },
  { path: 'marketplaceListings.flipkart.material', label: 'Material', kind: 'text' },
  { path: 'marketplaceListings.flipkart.idealFor', label: 'Ideal For', kind: 'text' },
  { path: 'marketplaceListings.flipkart.packOf', label: 'Pack Of', kind: 'text' },
  { path: 'marketplaceListings.flipkart.salesPackage', label: 'Sales Package', kind: 'text' },
  { path: 'marketplaceListings.flipkart.warranty', label: 'Warranty', kind: 'text' },
  { path: 'marketplaceListings.flipkart.weight', label: 'Weight', kind: 'text' },
  { path: 'marketplaceListings.flipkart.dimensions', label: 'Dimensions', kind: 'text' },
];

@Component({
  selector: 'app-flipkart-listing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AttributeCard, EditableTextArea, KeywordChips],
  templateUrl: './flipkart-listing.html',
})
export class FlipkartListing {
  workspaceState = inject(WorkspaceStateService);
  private aiListingService = inject(AIListingService);
  private attributeService = inject(AttributeService);

  fields = FIELDS;
  regeneratingPath = signal<string | null>(null);

  categoryAttributes = computed(() => {
    const product = this.workspaceState.product();
    if (!product) return [];
    return this.attributeService.getAttributesFor(product.classification.category, product.classification.subCategory, 'flipkart');
  });

  asAttribute(field: FieldConfig): Attribute {
    return { id: field.path, label: field.label, type: 'string', required: false, marketplaces: ['flipkart'] };
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
    return this.workspaceState.product()?.dynamicAttributes?.['flipkart']?.[attr.id] ?? '';
  }

  setCategoryAttributeValue(attr: Attribute, value: string) {
    this.workspaceState.update(p => ({
      ...p,
      dynamicAttributes: {
        ...p.dynamicAttributes,
        flipkart: { ...(p.dynamicAttributes['flipkart'] ?? {}), [attr.id]: value },
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
