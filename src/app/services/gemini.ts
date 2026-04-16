import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from "@google/genai";
import { GEMINI_API_KEY } from '../env';

export interface ProductDetails {
  name: string;
  description: string;
  priceINR: string;
  gstRate: string;
  hsnCode: string;
  material: string;
  variations: string[];
  platformContent: {
    amazon: { title: string; description: string; keywords: string[] };
    flipkart: { title: string; description: string; highlights: string[] };
    meesho: { title: string; description: string; category: string };
    instagram: { caption: string; hashtags: string[] };
  };
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

  async extractProductDetails(base64Image: string, mimeType: string): Promise<ProductDetails> {
    const model = "gemini-3-flash-preview";
    
    const prompt = `
      Analyze this product image for an e-commerce seller in India. 
      Extract and generate the following details following Indian standards:
      1. Product Name (concise and catchy)
      2. Product Description (detailed, highlighting features)
      3. Estimated Price in INR (provide a realistic value or range)
      4. Applicable GST Rate (e.g., 5%, 12%, 18%)
      5. Likely HSN Code (8-digit code)
      6. Material (e.g., Cotton, Leather, Plastic, Stainless Steel)
      7. Potential Variations (e.g., colors, sizes, materials)
      
      Also, generate platform-specific content for:
      - Amazon: SEO-optimized title, bullet-point description, and backend keywords.
      - Flipkart: Catchy title, description, and key product highlights.
      - Meesho: Simple title, description, and suggested category.
      - Instagram: Engaging caption with emojis and relevant hashtags.

      Return the data in the specified JSON format.
    `;

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
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            priceINR: { type: Type.STRING },
            gstRate: { type: Type.STRING },
            hsnCode: { type: Type.STRING },
            material: { type: Type.STRING },
            variations: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            platformContent: {
              type: Type.OBJECT,
              properties: {
                amazon: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["title", "description", "keywords"]
                },
                flipkart: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    highlights: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["title", "description", "highlights"]
                },
                meesho: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    category: { type: Type.STRING }
                  },
                  required: ["title", "description", "category"]
                },
                instagram: {
                  type: Type.OBJECT,
                  properties: {
                    caption: { type: Type.STRING },
                    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["caption", "hashtags"]
                }
              },
              required: ["amazon", "flipkart", "meesho", "instagram"]
            }
          },
          required: ["name", "description", "priceINR", "gstRate", "hsnCode", "material", "variations", "platformContent"]
        }
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
