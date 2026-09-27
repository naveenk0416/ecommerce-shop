import { Injectable, signal, effect, inject } from '@angular/core';
import { AuthService } from './auth';
import { apiFetch } from './api';
import { handleApiError, OperationType } from '../utils/error-handler';

export interface TemplateField {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  customPrompt?: string;
  type: 'string' | 'array';
}

export interface PlatformTemplate {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  customPrompt?: string;
  fields: TemplateField[];
}

const LEGACY_INSTAGRAM_PROMPT = 'Engaging caption with emojis and relevant hashtags.';
const INSTAGRAM_DEFAULT_PROMPT = 'Engaging caption with emojis and up to 20 relevant, unique hashtags (Instagram allows max 30).';

const DEFAULT_TEMPLATES: PlatformTemplate[] = [
  {
    id: 'details',
    label: 'General Details',
    enabled: true,
    order: 0,
    fields: [
      { id: 'name', label: 'Product Name', enabled: true, order: 0, type: 'string' },
      { id: 'description', label: 'Description', enabled: true, order: 1, type: 'string' },
      { id: 'priceINR', label: 'Price (INR)', enabled: true, order: 2, type: 'string' },
      { id: 'sellingPrice', label: 'Selling Price (Raw Number)', enabled: true, order: 3, type: 'string' },
      { id: 'costPrice', label: 'Cost Price (Raw Number)', enabled: false, order: 4, type: 'string' },
      // Not AI-generated: the backend calculates GST from the HSN code + selling price (GST 2.0).
      { id: 'gstRate', label: 'GST Rate (auto-calculated from HSN + price)', enabled: true, order: 5, type: 'string' },
      { id: 'hsnCode', label: 'HSN Code', enabled: true, order: 6, type: 'string', customPrompt: 'Accurate 6 or 8 digit Indian HSN code based on product category' },
      { id: 'material', label: 'Material', enabled: true, order: 7, type: 'string' },
      { id: 'variations', label: 'Variations', enabled: true, order: 8, type: 'array' },
    ]
  },
  {
    id: 'amazon',
    label: 'Amazon',
    enabled: true,
    order: 1,
    customPrompt: 'SEO-optimized title, bullet-point description, and backend keywords.',
    fields: [
      { id: 'title', label: 'Title', enabled: true, order: 0, type: 'string' },
      { id: 'description', label: 'Description', enabled: true, order: 1, type: 'string' },
      { id: 'keywords', label: 'Keywords', enabled: true, order: 2, type: 'array' },
    ]
  },
  {
    id: 'flipkart',
    label: 'Flipkart',
    enabled: true,
    order: 2,
    customPrompt: 'Catchy title, description, and key product highlights.',
    fields: [
      { id: 'title', label: 'Title', enabled: true, order: 0, type: 'string' },
      { id: 'description', label: 'Description', enabled: true, order: 1, type: 'string' },
      { id: 'highlights', label: 'Highlights', enabled: true, order: 2, type: 'array' },
    ]
  },
  {
    id: 'meesho',
    label: 'Meesho',
    enabled: true,
    order: 3,
    customPrompt: 'Simple title, description, and suggested category.',
    fields: [
      { id: 'title', label: 'Title', enabled: true, order: 0, type: 'string' },
      { id: 'description', label: 'Description', enabled: true, order: 1, type: 'string' },
      { id: 'category', label: 'Category', enabled: true, order: 2, type: 'string' },
    ]
  },
  {
    id: 'instagram',
    label: 'Instagram',
    enabled: true,
    order: 4,
    customPrompt: INSTAGRAM_DEFAULT_PROMPT,
    fields: [
      { id: 'caption', label: 'Caption', enabled: true, order: 0, type: 'string' },
      { id: 'hashtags', label: 'Hashtags', enabled: true, order: 1, type: 'array' },
    ]
  }
];

@Injectable({
  providedIn: 'root'
})
export class TemplateService {
  private auth = inject(AuthService);
  templates = signal<PlatformTemplate[]>(DEFAULT_TEMPLATES);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (!user) {
        this.templates.set(DEFAULT_TEMPLATES);
        return;
      }

      this.loadTemplates();
    });
  }

  private async loadTemplates() {
    const user = this.auth.user();
    if (!user) {
      this.templates.set(DEFAULT_TEMPLATES);
      return;
    }

    try {
      const response = await apiFetch<{ configs: PlatformTemplate[] | null }>('/templates');
      const configs = response.configs;

      if (!configs) {
        await this.saveTemplates(DEFAULT_TEMPLATES);
        this.templates.set(DEFAULT_TEMPLATES);
        return;
      }

      const merged = DEFAULT_TEMPLATES.map(def => {
        const userConf = configs.find(c => c.id === def.id);
        if (!userConf) return def;

        return {
          ...def,
          ...userConf,
          // Saved templates from before the hashtag limit get the new default prompt.
          customPrompt: userConf.customPrompt === LEGACY_INSTAGRAM_PROMPT ? def.customPrompt : (userConf.customPrompt ?? def.customPrompt),
          fields: def.fields.map(defField => {
            const userField = userConf.fields.find(f => f.id === defField.id);
            if (!userField) return defField;
            // GST is a system field: keep the default label and never carry an AI prompt for it.
            if (defField.id === 'gstRate') return { ...defField, enabled: userField.enabled, order: userField.order };
            return { ...defField, ...userField };
          }).sort((a, b) => a.order - b.order)
        };
      }).sort((a, b) => a.order - b.order);

      this.templates.set(merged);
    } catch (error) {
      handleApiError(error, OperationType.LIST, '/templates');
    }
  }

  async saveTemplates(configs: PlatformTemplate[]) {
    const user = this.auth.user();
    if (!user) return;

    try {
      await apiFetch('/templates', {
        method: 'POST',
        body: { configs }
      });
      this.templates.set(configs);
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, '/templates');
    }
  }

  async resetToDefault() {
    await this.saveTemplates(DEFAULT_TEMPLATES);
  }
}
