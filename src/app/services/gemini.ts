import { Injectable } from '@angular/core';
import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY } from '../env';
import { PlatformTemplate } from './template';

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
}
