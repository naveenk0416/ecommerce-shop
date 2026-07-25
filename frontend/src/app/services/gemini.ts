import { Injectable } from '@angular/core';
import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY } from '../env';
import { PlatformTemplate } from './template';
import { GENERAL_DETAILS_SECTIONS } from '../features/listing-workspace/tabs/general-details/general-details.mock';

export interface ProductDetails {
  name: string;
  description: string;
  priceINR: string;
  gstRate: string;
  hsnCode: string;
  material: string;
  variations: string[];
  platformContent: Record<string, Record<string, string | string[]>>;
  category?: string;
  quantity?: number;
  costPrice?: number;
  sellingPrice?: number;
}

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private aiClient: GoogleGenAI | null = null;

  private get ai() {
    if (!this.aiClient) {
      const key = GEMINI_API_KEY as string;
      if (!key) {
        throw new Error('GEMINI_API_KEY is not defined. Please configure it in your secrets.');
      }
      this.aiClient = new GoogleGenAI({ apiKey: key });
    }
    return this.aiClient;
  }

  async extractProductDetails(base64Image: string, mimeType: string, templates: PlatformTemplate[], isPro = false): Promise<ProductDetails> {
    const model = "gemini-3-flash-preview";
    
    // Build parts of the prompt based on templates
    const detailTemplate = templates.find(t => t.id === 'details');
    const enabledPlatforms = templates.filter(t => t.id !== 'details' && t.enabled);

    let prompt = `
      Analyze this product image for an e-commerce seller in India. 
      Extract and generate the following details following Indian standards:
    `;

    if (detailTemplate) {
      detailTemplate.fields.filter(f => {
        if (!isPro && (f.id === 'hsnCode' || f.id === 'gstRate')) return false;
        return f.enabled;
      }).forEach((f, i) => {
        prompt += `${i + 1}. ${f.label} (${f.customPrompt || 'provide relevant value'})\n`;
      });
    }

    prompt += `\nAlso, generate platform-specific content for the following platforms:\n`;
    enabledPlatforms.forEach(p => {
      prompt += `- ${p.label}: ${p.customPrompt || 'Generate relevant content'} based on these fields: ${p.fields.filter(f => f.enabled).map(f => f.label).join(', ')}. ${p.fields.filter(f => f.customPrompt).map(f => `${f.label}: ${f.customPrompt}`).join('. ')}\n`;
    });

    prompt += `\nReturn the data in the specified JSON format. Ensure HSN code is consistently chosen based on the most accurate Indian GST classification for this specific product category.`;

    // Build Dynamic Schema
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    if (detailTemplate) {
      detailTemplate.fields.filter(f => {
        if (!isPro && (f.id === 'hsnCode' || f.id === 'gstRate')) return false;
        return f.enabled;
      }).forEach(f => {
        properties[f.id] = { type: f.type === 'array' ? 'array' : 'string' };
        if (f.type === 'array') {
          (properties[f.id] as Record<string, unknown>)['items'] = { type: 'string' };
        }
        required.push(f.id);
      });
    }

    const platformProperties: Record<string, unknown> = {};
    const platformRequired: string[] = [];

    enabledPlatforms.forEach(p => {
      const pFields: Record<string, unknown> = {};
      const pFieldsRequired: string[] = [];

      p.fields.filter(f => f.enabled).forEach(f => {
        pFields[f.id] = { type: f.type === 'array' ? 'array' : 'string' };
        if (f.type === 'array') {
          (pFields[f.id] as Record<string, unknown>)['items'] = { type: 'string' };
        }
        pFieldsRequired.push(f.id);
      });

      platformProperties[p.id] = {
        type: 'object',
        properties: pFields,
        required: pFieldsRequired
      };
      platformRequired.push(p.id);
    });

    properties['platformContent'] = {
      type: 'object',
      properties: platformProperties,
      required: platformRequired
    };
    required.push('platformContent');

    const responseSchema: Record<string, unknown> = {
      type: 'object',
      properties,
      required
    };

    const response = await this.ai.models.generateContent({
      model: model,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Image, mimeType: mimeType } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0
      }
    });

    if (!response.text) {
      throw new Error("Failed to extract product details: Empty response");
    }
    return JSON.parse(response.text);
  }

  /** Text-only structured generation: given a prompt and a JSON schema, returns the parsed result. */
  async generateStructured<T>(prompt: string, responseSchema: Record<string, unknown>): Promise<T> {
    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0,
      }
    });

    if (!response.text) {
      throw new Error("Failed to generate structured content: Empty response");
    }
    return JSON.parse(response.text) as T;
  }

  async generateWhiteBackground(base64Image: string, mimeType: string): Promise<string> {
    // Using gemini-2.5-flash-image to "edit" the image
    const model = "gemini-2.5-flash-image";
    
    const response = await this.ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: 'Please regenerate this exact product but on a clean, professional pure white background for an e-commerce listing. The product should be centered and well-lit.',
          },
        ],
      },
    });

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0 || !candidates[0].content?.parts) {
      throw new Error("Failed to generate image: No candidates returned");
    }

    for (const part of candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    
    throw new Error("Failed to generate image with white background");
  }

  /**
   * Analyzes a product image and returns 3 plausible candidate values per General Details field
   * (index 0 is the primary recommendation; the rest back the field's Regenerate action).
   * Fields that can't be read from the photo (SKU, cost, stock, etc.) are estimated by the model.
   */
  async extractGeneralDetails(base64Image: string, mimeType: string): Promise<Record<string, string[]>> {
    const fields = GENERAL_DETAILS_SECTIONS.flatMap((section) => section.fields);
    const fieldList = fields.map((f) => `- ${f.key}: ${f.label}`).join('\n');

    const prompt = `
      You are helping an Indian e-commerce seller list this product.
      Analyze the attached product image and, for every field listed below, return an array of
      exactly 3 plausible values ordered from most to least likely (the first is your best recommendation).
      Where a field cannot be determined visually (for example sku, manufacturer, costPrice, stock,
      marketplaceFee, shippingFee, profitMargin, or exact dimensions), give your best professional
      estimate based on the product category and typical Indian marketplace conventions rather than
      leaving it blank.
      For "images" and "videos" return arrays of plausible comma-separated CDN-style URL lists rather
      than real files.

      Fields:
      ${fieldList}

      Respond only with the requested JSON.
    `;

    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const field of fields) {
      properties[field.key] = { type: 'array', items: { type: 'string' } };
      required.push(field.key);
    }

    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Image, mimeType } },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: { type: 'object', properties, required },
        temperature: 0.4,
      },
    });

    if (!response.text) {
      throw new Error('Failed to extract product details: empty response');
    }
    return JSON.parse(response.text) as Record<string, string[]>;
  }
}
