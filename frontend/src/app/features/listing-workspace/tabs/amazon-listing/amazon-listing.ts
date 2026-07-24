import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { WorkspaceStateService } from '../../state/workspace-state.service';
import { AIListingService } from '../../services/ai-listing.service';
import { SEOService } from '../../services/seo.service';
import { AttributeCard } from '../../components/attribute-card/attribute-card';
import { EditableTextArea } from '../../components/editable-textarea/editable-textarea';
import { KeywordChips } from '../../components/keyword-chips/keyword-chips';
import { SEOScore } from '../../components/seo-score/seo-score';
import { Attribute } from '../../models/category.model';
import { getPath, setPath } from '../../utils/field-path.util';

interface FieldConfig {
  path: string;
  label: string;
  kind: 'text' | 'longtext' | 'array';
}

const FIELDS: FieldConfig[] = [
  { path: 'marketplaceListings.amazon.seoTitle', label: 'SEO Title', kind: 'text' },
  { path: 'marketplaceListings.amazon.longDescription', label: 'Long Description', kind: 'longtext' },
  { path: 'marketplaceListings.amazon.bulletPoints', label: 'Bullet Points (5)', kind: 'array' },
  { path: 'marketplaceListings.amazon.backendSearchTerms', label: 'Backend Search Terms', kind: 'longtext' },
  { path: 'marketplaceListings.amazon.searchKeywords', label: 'Search Keywords', kind: 'array' },
  { path: 'marketplaceListings.amazon.subjectKeywords', label: 'Subject Keywords', kind: 'array' },
  { path: 'marketplaceListings.amazon.brand', label: 'Brand', kind: 'text' },
  { path: 'marketplaceListings.amazon.manufacturer', label: 'Manufacturer', kind: 'text' },
  { path: 'marketplaceListings.amazon.material', label: 'Material', kind: 'text' },
  { path: 'marketplaceListings.amazon.color', label: 'Color', kind: 'text' },
  { path: 'marketplaceListings.amazon.size', label: 'Size', kind: 'text' },
  { path: 'marketplaceListings.amazon.style', label: 'Style', kind: 'text' },
  { path: 'marketplaceListings.amazon.pattern', label: 'Pattern', kind: 'text' },
  { path: 'marketplaceListings.amazon.occasion', label: 'Occasion', kind: 'text' },
  { path: 'marketplaceListings.amazon.targetAudience', label: 'Target Audience', kind: 'text' },
  { path: 'marketplaceListings.amazon.includedComponents', label: 'Included Components', kind: 'text' },
  { path: 'marketplaceListings.amazon.careInstructions', label: 'Care Instructions', kind: 'text' },
  { path: 'marketplaceListings.amazon.warranty', label: 'Warranty', kind: 'text' },
  { path: 'marketplaceListings.amazon.variationTheme', label: 'Variation Theme', kind: 'text' },
  { path: 'marketplaceListings.amazon.parentSku', label: 'Parent SKU', kind: 'text' },
  { path: 'marketplaceListings.amazon.childSku', label: 'Child SKU', kind: 'text' },
];

@Component({
  selector: 'app-amazon-listing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AttributeCard, EditableTextArea, KeywordChips, SEOScore],
  templateUrl: './amazon-listing.html',
})
export class AmazonListing {
  workspaceState = inject(WorkspaceStateService);
  private aiListingService = inject(AIListingService);
  private seoService = inject(SEOService);

  fields = FIELDS;
  regeneratingPath = signal<string | null>(null);

  seoAnalysis = computed(() => {
    const product = this.workspaceState.product();
    return product ? this.seoService.analyze(product) : null;
  });

  charCount = computed(() => this.workspaceState.product()?.marketplaceListings.amazon.charCount ?? 0);
  keywordCount = computed(() => this.workspaceState.product()?.marketplaceListings.amazon.keywordCount ?? 0);

  asAttribute(field: FieldConfig): Attribute {
    return { id: field.path, label: field.label, type: 'string', required: false, marketplaces: ['amazon'] };
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
