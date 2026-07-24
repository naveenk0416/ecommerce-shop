import { Injectable, inject } from '@angular/core';
import { GeminiService } from '../../../services/gemini';
import { Product } from '../models/product.model';

export type FieldValueType = 'string' | 'array' | 'number' | 'boolean';

/**
 * Generalizes GeminiService's dynamic-schema-from-template technique (prompt +
 * matching JSON responseSchema, one generateContent call) from the narrow
 * ProductDetails shape to the full Product shape used by the workspace.
 * Composes GeminiService rather than re-instantiating the GoogleGenAI client.
 */
@Injectable({ providedIn: 'root' })
export class AIListingService {
  private gemini = inject(GeminiService);

  /** Regenerates a single field's value using the product's existing context as the prompt basis. */
  async regenerateField(
    product: Product,
    fieldLabel: string,
    valueType: FieldValueType,
    customPrompt?: string
  ): Promise<string | string[]> {
    const context = `${product.basicInformation.productName || 'Unnamed product'} — category: ${product.classification.category || 'unspecified'}, material: ${product.physicalAttributes.material || 'unspecified'}.`;
    const prompt = `Given this product: ${context}\nGenerate a value for the field "${fieldLabel}". ${customPrompt || 'Provide an accurate, e-commerce-ready value for an Indian marketplace listing.'}\nReturn only the JSON.`;

    const schema = {
      type: 'object',
      properties: {
        value: valueType === 'array'
          ? { type: 'array', items: { type: 'string' } }
          : { type: 'string' },
      },
      required: ['value'],
    };

    const result = await this.gemini.generateStructured<{ value: string | string[] }>(prompt, schema);
    return result.value;
  }

  /**
   * Phase 0 scaffold for tabs not yet wired to real generation (Amazon/Flipkart/
   * Meesho/Instagram/AI Insights). Extension point: replace with a real
   * regenerateField-style call per tab once that tab is wired, following the
   * General Details pattern above.
   */
  async regenerateMock<T>(currentValue: T): Promise<T> {
    await new Promise(resolve => setTimeout(resolve, 400));
    return currentValue;
  }
}
