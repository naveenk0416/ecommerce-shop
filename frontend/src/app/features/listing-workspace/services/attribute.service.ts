import { Injectable, inject } from '@angular/core';
import { Attribute } from '../models/category.model';
import { MarketplaceId } from '../models/marketplace.model';
import { CATEGORY_ATTRIBUTES } from '../data/category-attributes.data';
import { TemplateService } from '../../../services/template';

/**
 * Dynamic Attribute Engine. Merges the universal per-marketplace field layer
 * (TemplateService, which already models Amazon/Flipkart/Meesho/Instagram fields)
 * with the category-scoped layer (CATEGORY_ATTRIBUTES). Category names never
 * appear as branches in consuming components — they only ever call getAttributesFor().
 */
@Injectable({ providedIn: 'root' })
export class AttributeService {
  private templates = inject(TemplateService);

  getAttributesFor(category: string, subCategory: string, marketplaceId: MarketplaceId): Attribute[] {
    const categoryMatch = CATEGORY_ATTRIBUTES.find(
      set => set.category === category && set.subCategory === subCategory && set.marketplaces.includes(marketplaceId)
    );
    const categoryAttributes = categoryMatch?.attributes ?? [];

    const platformTemplate = this.templates.templates().find(t => t.id === marketplaceId);
    const platformAttributes: Attribute[] = (platformTemplate?.fields ?? [])
      .filter(f => f.enabled)
      .map(f => ({
        id: f.id,
        label: f.label,
        type: f.type,
        required: true,
        marketplaces: [marketplaceId],
      }));

    const merged = new Map<string, Attribute>();
    for (const attr of [...platformAttributes, ...categoryAttributes]) {
      merged.set(attr.id, attr);
    }
    return Array.from(merged.values());
  }

  categoriesWithAttributes(): string[] {
    return Array.from(new Set(CATEGORY_ATTRIBUTES.map(s => s.category)));
  }
}
