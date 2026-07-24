import { Injectable, signal } from '@angular/core';
import { Category } from '../models/category.model';
import { CATEGORY_ATTRIBUTES } from '../data/category-attributes.data';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly categories = signal<Category[]>(this.buildCategoryTree());

  private buildCategoryTree(): Category[] {
    const byCategory = new Map<string, Set<string>>();
    for (const set of CATEGORY_ATTRIBUTES) {
      if (!byCategory.has(set.category)) byCategory.set(set.category, new Set());
      byCategory.get(set.category)!.add(set.subCategory);
    }
    return Array.from(byCategory.entries()).map(([label, subs]) => ({
      id: label.toLowerCase().replace(/\s+/g, '-'),
      label,
      subCategories: Array.from(subs).map(s => ({ id: s.toLowerCase().replace(/\s+/g, '-'), label: s })),
    }));
  }

  all() {
    return this.categories();
  }

  find(label: string): Category | undefined {
    return this.categories().find(c => c.label === label);
  }
}
