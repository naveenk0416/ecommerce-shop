import { Injectable } from '@angular/core';
import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY } from '../env';
import { PlatformTemplate } from './template';
import { GENERAL_DETAILS_SECTIONS } from '../features/listing-workspace/tabs/general-details/general-details.mock';
import { AMAZON_LISTING_SECTIONS } from '../features/listing-workspace/tabs/amazon-listing/amazon-listing.mock';
import { FLIPKART_LISTING_SECTIONS } from '../features/listing-workspace/tabs/flipkart-listing/flipkart-listing.mock';
import { MEESHO_LISTING_SECTIONS } from '../features/listing-workspace/tabs/meesho-listing/meesho-listing.mock';
import { INSTAGRAM_CONTENT_SECTIONS } from '../features/listing-workspace/tabs/instagram-content/instagram-content.mock';
import { FieldConfig } from '../features/listing-workspace/models/field-section.model';
import { LISTING_SUMMARY_FIELDS } from '../features/optimize/listing-summary.model';

/**
 * Turns a Gemini SDK error (often a raw JSON error body as the Error message) into a short,
 * human-readable string. Falls back to the raw message for anything it doesn't recognize.
 */
export function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  try {
    const parsed = JSON.parse(raw) as {
      error?: { status?: string; message?: string; details?: { '@type'?: string; retryDelay?: string }[] };
    };
    const status = parsed.error?.status;

    if (status === 'RESOURCE_EXHAUSTED') {
      const retryInfo = parsed.error?.details?.find((d) => d['@type']?.includes('RetryInfo'));
      const seconds = retryInfo?.retryDelay ? Math.ceil(parseFloat(retryInfo.retryDelay)) : null;
      return seconds
        ? `Try again in about ${seconds} seconds, or once your daily quota resets.`
        : `Please try again later.`;
    }

    if (status === 'UNAVAILABLE') {
      return 'Sell Assist is temporarily overloaded. Please try again in a moment.';
    }

    if (parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Not a JSON error body — fall through to the raw message.
  }

  return raw || 'Failed to generate content. Please try again.';
}

export interface AiFieldExtraction {
  /** 3 candidate values, ordered most to least likely; index 0 is the primary/displayed value. */
  values: string[];
  /** Confidence in the primary value, 0-100. */
  confidence: number;
  /** Short explanation of how the value was determined or estimated. */
  reason: string;
}

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
   * Analyzes a product image and returns a fully-populated General Details listing.
   * Every field carries 3 candidate values (index 0 is primary, the rest back Regenerate),
   * a confidence score, and a reason — per the assumption/fallback rules below. Fields are
   * never left blank: detect from the image where possible, otherwise estimate or fall back
   * to the documented default and mark confidence accordingly.
   */
  async extractGeneralDetails(base64Image: string, mimeType: string): Promise<Record<string, AiFieldExtraction>> {
    const fields = GENERAL_DETAILS_SECTIONS.flatMap((section) => section.fields);
    const fieldList = fields.map((f) => `- ${f.key}: ${f.label}`).join('\n');

    const prompt = `
      You are generating a complete Indian marketplace product listing from a product photo.
      Never leave a field blank. For every field, follow this priority order:
      1. Detect the value directly from the image if it is visible.
      2. If not visible, estimate a plausible value using category, material, dimensions, and
         comparable products.
      3. If truly impossible to determine, use the documented fallback default below.

      Field-specific rules:
      - brand: if a brand name or logo is clearly visible, use it with high confidence. Otherwise
        use "Generic" with low confidence and reason "Brand not visible in uploaded images."
      - manufacturer: if unknown, use "Generic Manufacturer".
      - importer: if unknown, use "Not Available".
      - packer: if unknown, use "Generic Packer".
      - countryOfOrigin: if it cannot be determined, default to "India" with low confidence and a
        reason explaining it is a default assumption because origin cannot be verified.
      - modelNumber: always auto-generate a plausible model number such as "SA-JWL-000145"
        (prefix based on category).
      - sku: always auto-generate a plausible SKU such as "SKU-ERR-100235" (prefix based on
        category).
      - hsn: determine from category, sub-category, product type, and material with high
        confidence.
      - gst: determine the applicable GST percentage based on the HSN code.
      - category, subCategory, productType: classify with high confidence based on visual
        inspection.
      - material: estimate the most likely material (for example Brass, Cotton, Plastic, Steel,
        Wood, Silver, Gold Plated) with medium confidence.
      - color: detect the primary, secondary, and accent colors and combine them into one
        readable value, with high confidence.
      - weight: if not visible, estimate the approximate weight in grams based on category,
        material, dimensions, and similar products (for example "Approx. 35 g"), medium
        confidence.
      - dimensions: if not visible, estimate approximate length x width x height and prefix the
        value with "Approx." (for example "Approx. 10 x 8 x 4 cm"), medium confidence.
      - mrp: if unknown, estimate a recommended MRP based on category, material, and similar
        products.
      - sellingPrice: generate a recommended selling price.
      - discountPercent: generate a recommended discount percentage consistent with the MRP and
        selling price.
      - costPrice, marketplaceFee, shippingFee, profitMargin: estimate realistic values
        consistent with the recommended MRP and selling price.
      - stock: estimate a plausible starting stock quantity.
      - images, videos: return plausible comma-separated CDN-style URL lists, not real files.
      - altText, seoImageName: always generate SEO-friendly values, never leave blank.

      For every field, return:
      - "values": an array of exactly 3 plausible candidate strings, ordered from most to least
        likely (index 0 is the primary/recommended value shown to the user).
      - "confidence": your confidence in the primary value, a whole number from 0 to 100.
      - "reason": one short sentence explaining how the value was determined or estimated.

      Never omit a field and never return an empty string as a primary value.

      Fields:
      ${fieldList}

      Respond only with the requested JSON.
    `;

    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const field of fields) {
      properties[field.key] = {
        type: 'object',
        properties: {
          values: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['values', 'confidence', 'reason'],
      };
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
    return JSON.parse(response.text) as Record<string, AiFieldExtraction>;
  }

  /** Builds the shared values+confidence+reason JSON-schema fragment for a flat field list. */
  private fieldSchemaFor(fields: readonly FieldConfig[]): { properties: Record<string, unknown>; required: string[] } {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const field of fields) {
      properties[field.key] = {
        type: 'object',
        properties: {
          values: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['values', 'confidence', 'reason'],
      };
      required.push(field.key);
    }
    return { properties, required };
  }

  /**
   * Shared driver for the marketplace/content extraction methods below: builds the
   * values+confidence+reason schema for a flat field list, sends it with the given
   * instructions and image, and parses the result. Never leaves a field blank.
   */
  private async extractFields(
    base64Image: string,
    mimeType: string,
    fields: readonly FieldConfig[],
    instructions: string,
  ): Promise<Record<string, AiFieldExtraction>> {
    const fieldList = fields.map((f) => `- ${f.key}: ${f.label}`).join('\n');

    const prompt = `
      ${instructions}

      Never leave a field blank: detect the value from the image if visible, otherwise estimate a
      plausible value using category, material, and comparable products.

      For every field, return:
      - "values": an array of exactly 3 plausible candidate strings, ordered from most to least
        likely (index 0 is the primary/recommended value shown to the user).
      - "confidence": your confidence in the primary value, a whole number from 0 to 100.
      - "reason": one short sentence explaining how the value was determined or estimated.

      Fields:
      ${fieldList}

      Respond only with the requested JSON.
    `;

    const { properties, required } = this.fieldSchemaFor(fields);

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
      throw new Error('Failed to generate content: empty response');
    }
    return JSON.parse(response.text) as Record<string, AiFieldExtraction>;
  }

  /** Generates the simplified listing summary (title, category, price, stock, tags) for /optimize's General Details tab. */
  async extractListingSummary(base64Image: string, mimeType: string): Promise<Record<string, AiFieldExtraction>> {
    return this.extractFields(
      base64Image,
      mimeType,
      LISTING_SUMMARY_FIELDS,
      `You are drafting a quick-glance product listing summary for an Indian e-commerce seller
       from a product photo.
       - productTitle: a clear, customer-facing product name (for example "Layered Coin Charm
         Necklace — Rose Gold, 2-Strand").
       - category: a short category path (for example "Jewellery > Necklaces > Layered").
       - sku: always auto-generate a plausible SKU such as "NCK-RG-2041".
       - description: 2-4 sentences covering material, key features, and care/fit details.
       - sellingPrice, mrp: estimate a recommended price pair based on category and material.
       - costPrice: estimate a plausible cost price, typically 35-55% of the selling price.
       - stock: estimate a plausible starting stock quantity (for example "48 units").
       - searchTags: 5-6 short comma-separated search tags (for example "rose gold, layered
         necklace, coin pendant, gift for her, minimal jewellery").`,
    );
  }

  /** Generates a complete Amazon listing (title, bullets, keywords, attributes) from a product photo. */
  async extractAmazonListing(base64Image: string, mimeType: string): Promise<Record<string, AiFieldExtraction>> {
    return this.extractFields(
      base64Image,
      mimeType,
      AMAZON_LISTING_SECTIONS.flatMap((s) => s.fields),
      `You are writing an Amazon India listing from a product photo.
       - seoTitle: keyword-rich, under 200 characters.
       - bulletPoint1 through bulletPoint5: each starts with a short ALL-CAPS benefit tag followed
         by a colon (for example "SECURE HOLD: ..."), each a distinct selling point.
       - description: a persuasive paragraph covering material, use cases, and benefits.
       - backendKeywords, searchTerms, subjectKeywords: distinct comma-separated keyword lists
         under 250 characters each, avoid repeating the same words across the three fields.
       - brand: if a brand name or logo is visible use it with high confidence, otherwise use
         "Generic" with low confidence.
       - material, color, size, variation, warranty: estimate plausible values for this product.`,
    );
  }

  /** Generates a complete Flipkart listing from a product photo. */
  async extractFlipkartListing(base64Image: string, mimeType: string): Promise<Record<string, AiFieldExtraction>> {
    return this.extractFields(
      base64Image,
      mimeType,
      FLIPKART_LISTING_SECTIONS.flatMap((s) => s.fields),
      `You are writing a Flipkart India listing from a product photo.
       - seoTitle: keyword-rich, under 200 characters.
       - keyHighlight1 through keyHighlight5: short, distinct selling points.
       - description: a clear paragraph covering material, use cases, and benefits.
       - searchKeywords: a comma-separated keyword list under 250 characters.
       - brand: if a brand name or logo is visible use it with high confidence, otherwise use
         "Generic" with low confidence.
       - material, color, size, warranty: estimate plausible values for this product.`,
    );
  }

  /** Generates a complete Meesho listing from a product photo. */
  async extractMeeshoListing(base64Image: string, mimeType: string): Promise<Record<string, AiFieldExtraction>> {
    return this.extractFields(
      base64Image,
      mimeType,
      MEESHO_LISTING_SECTIONS.flatMap((s) => s.fields),
      `You are writing a Meesho listing from a product photo. Meesho listings are simple and
       value-focused, aimed at budget-conscious shoppers.
       - listingTitle: under 100 characters.
       - description: a short, simple, value-focused description.
       - searchKeywords: a comma-separated keyword list under 250 characters.
       - brand: if a brand name or logo is visible use it with high confidence, otherwise use
         "Generic" with low confidence.
       - color, size: estimate plausible values for this product.`,
    );
  }

  /** Generates Instagram post content (caption, hashtags, hook, timing) from a product photo. */
  async extractInstagramContent(base64Image: string, mimeType: string): Promise<Record<string, AiFieldExtraction>> {
    return this.extractFields(
      base64Image,
      mimeType,
      INSTAGRAM_CONTENT_SECTIONS.flatMap((s) => s.fields),
      `You are writing Instagram content to promote this product for an Indian e-commerce seller.
       - caption: an engaging caption with a natural tone and 2-3 relevant emojis, ending with a
         soft call to action.
       - cta: a short call-to-action phrase (for example "Shop now via the link in bio").
       - reelHook: a short, attention-grabbing opening line for a Reel featuring this product.
       - bestPostingTime: a plausible best posting window for an Indian audience (for example
         "Weekdays, 7-9 PM IST").
       - hashtags: a space-separated string of exactly 50 relevant hashtags, each starting with
         "#", mixing broad and niche tags.
       - trendingHashtags: a space-separated string of 8-10 currently-trending-style hashtags
         relevant to this product's category, distinct from the main hashtag set.`,
    );
  }

  /**
   * Generates the general summary plus all four marketplace/content tabs in a single Gemini
   * request, instead of one request per tab. Cuts /optimize's Gemini calls per uploaded photo
   * from 5 down to 1 — each tab reads its slice of the same combined response.
   */
  async extractAllListings(base64Image: string, mimeType: string): Promise<AllListingsResult> {
    const groups: { key: keyof AllListingsResult; fields: readonly FieldConfig[]; instructions: string }[] = [
      {
        key: 'general',
        fields: LISTING_SUMMARY_FIELDS,
        instructions: `GENERAL SUMMARY — a quick-glance product listing summary for an Indian
          e-commerce seller.
          - productTitle: a clear, customer-facing product name (for example "Layered Coin Charm
            Necklace — Rose Gold, 2-Strand").
          - category: a short category path (for example "Jewellery > Necklaces > Layered").
          - sku: always auto-generate a plausible SKU such as "NCK-RG-2041".
          - description: 2-4 sentences covering material, key features, and care/fit details.
          - sellingPrice, mrp: estimate a recommended price pair based on category and material.
          - costPrice: estimate a plausible cost price, typically 35-55% of the selling price.
          - stock: estimate a plausible starting stock quantity (for example "48 units").
          - searchTags: 5-6 short comma-separated search tags (for example "rose gold, layered
            necklace, coin pendant, gift for her, minimal jewellery").`,
      },
      {
        key: 'amazon',
        fields: AMAZON_LISTING_SECTIONS.flatMap((s) => s.fields),
        instructions: `AMAZON LISTING — an Amazon India listing.
          - seoTitle: keyword-rich, under 200 characters.
          - bulletPoint1 through bulletPoint5: each starts with a short ALL-CAPS benefit tag
            followed by a colon (for example "SECURE HOLD: ..."), each a distinct selling point.
          - description: a persuasive paragraph covering material, use cases, and benefits.
          - backendKeywords, searchTerms, subjectKeywords: distinct comma-separated keyword lists
            under 250 characters each, avoid repeating the same words across the three fields.
          - brand: if a brand name or logo is visible use it with high confidence, otherwise use
            "Generic" with low confidence.
          - material, color, size, variation, warranty: estimate plausible values for this product.`,
      },
      {
        key: 'flipkart',
        fields: FLIPKART_LISTING_SECTIONS.flatMap((s) => s.fields),
        instructions: `FLIPKART LISTING — a Flipkart India listing.
          - seoTitle: keyword-rich, under 200 characters.
          - keyHighlight1 through keyHighlight5: short, distinct selling points.
          - description: a clear paragraph covering material, use cases, and benefits.
          - searchKeywords: a comma-separated keyword list under 250 characters.
          - brand: if a brand name or logo is visible use it with high confidence, otherwise use
            "Generic" with low confidence.
          - material, color, size, warranty: estimate plausible values for this product.`,
      },
      {
        key: 'meesho',
        fields: MEESHO_LISTING_SECTIONS.flatMap((s) => s.fields),
        instructions: `MEESHO LISTING — a Meesho listing. Meesho listings are simple and
          value-focused, aimed at budget-conscious shoppers.
          - listingTitle: under 100 characters.
          - description: a short, simple, value-focused description.
          - searchKeywords: a comma-separated keyword list under 250 characters.
          - brand: if a brand name or logo is visible use it with high confidence, otherwise use
            "Generic" with low confidence.
          - color, size: estimate plausible values for this product.`,
      },
      {
        key: 'instagram',
        fields: INSTAGRAM_CONTENT_SECTIONS.flatMap((s) => s.fields),
        instructions: `INSTAGRAM CONTENT — a post to promote this product for an Indian
          e-commerce seller.
          - caption: an engaging caption with a natural tone and 2-3 relevant emojis, ending with
            a soft call to action.
          - cta: a short call-to-action phrase (for example "Shop now via the link in bio").
          - reelHook: a short, attention-grabbing opening line for a Reel featuring this product.
          - bestPostingTime: a plausible best posting window for an Indian audience (for example
            "Weekdays, 7-9 PM IST").
          - hashtags: a space-separated string of exactly 50 relevant hashtags, each starting with
            "#", mixing broad and niche tags.
          - trendingHashtags: a space-separated string of 8-10 currently-trending-style hashtags
            relevant to this product's category, distinct from the main hashtag set.`,
      },
    ];

    let prompt = `
      You are an AI assistant generating a complete multi-marketplace product listing for an
      Indian e-commerce seller from a single product photo. Produce all five sections below in
      one pass. Never leave a field blank: detect the value from the image if visible, otherwise
      estimate a plausible value using category, material, and comparable products.
    `;

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const group of groups) {
      const fieldList = group.fields.map((f) => `- ${f.key}: ${f.label}`).join('\n');
      prompt += `\n\n=== ${group.key.toUpperCase()} SECTION ===\n${group.instructions}\n\nFields:\n${fieldList}`;

      const schema = this.fieldSchemaFor(group.fields);
      properties[group.key] = { type: 'object', properties: schema.properties, required: schema.required };
      required.push(group.key);
    }

    prompt += `

      For every field in every section, return:
      - "values": an array of exactly 3 plausible candidate strings, ordered from most to least
        likely (index 0 is the primary/recommended value shown to the user).
      - "confidence": your confidence in the primary value, a whole number from 0 to 100.
      - "reason": one short sentence explaining how the value was determined or estimated.

      Respond only with the requested JSON, covering all five sections: ${groups.map((g) => g.key).join(', ')}.
    `;

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
      throw new Error('Failed to generate listings: empty response');
    }
    return JSON.parse(response.text) as AllListingsResult;
  }
}

/** One combined Gemini response covering the general summary and every marketplace/content tab. */
export interface AllListingsResult {
  general: Record<string, AiFieldExtraction>;
  amazon: Record<string, AiFieldExtraction>;
  flipkart: Record<string, AiFieldExtraction>;
  meesho: Record<string, AiFieldExtraction>;
  instagram: Record<string, AiFieldExtraction>;
}
