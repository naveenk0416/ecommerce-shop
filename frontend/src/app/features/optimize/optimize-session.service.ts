import { Injectable, inject, signal } from '@angular/core';
import { AiFieldExtraction, formatGeminiError, GeminiService } from '../../services/gemini';

export type OptimizeTabKey = 'general' | 'amazon' | 'flipkart' | 'meesho' | 'instagram';

export type TabResult = Record<string, AiFieldExtraction>;

/**
 * Shared per-session state for the /optimize route tree: the uploaded product image and a
 * cache of each tab's generated content, so switching tabs doesn't re-run Gemini every time
 * and every tab reflects the same uploaded photo. Provided only on the /optimize route tree —
 * /workspace pages never see this service and keep their existing static-mock behavior.
 *
 * Generation is a single combined Gemini call covering every tab (see GeminiService.extractAllListings),
 * fired once per uploaded photo instead of once per tab click — tabs only read from `cache`.
 */
@Injectable()
export class OptimizeSessionService {
  private readonly gemini = inject(GeminiService);

  imagePreview = signal<string | null>(null);
  imageBase64 = signal<string | null>(null);
  imageMimeType = signal<string | null>(null);

  /** Full photo gallery for display; index 0 is always the primary photo sent to Gemini. */
  galleryImages = signal<string[]>([]);

  private readonly cache = signal<Partial<Record<OptimizeTabKey, TabResult>>>({});

  /** True while the single combined Gemini call for all tabs is in flight. */
  isGenerating = signal(false);
  /** Set if the combined generation call failed; every tab surfaces the same error + retry. */
  generationError = signal<string | null>(null);

  hasImage(): boolean {
    return this.imageBase64() !== null;
  }

  setImage(dataUrl: string, base64: string, mimeType: string): void {
    this.imagePreview.set(dataUrl);
    this.imageBase64.set(base64);
    this.imageMimeType.set(mimeType);
    this.galleryImages.set([dataUrl]);
    this.cache.set({});
    this.generateAll();
  }

  /** Adds an extra gallery photo. Purely visual — only the primary photo is analyzed by Gemini. */
  addGalleryImage(dataUrl: string): void {
    this.galleryImages.update((images) => [...images, dataUrl]);
  }

  getResult(tab: OptimizeTabKey): TabResult | undefined {
    return this.cache()[tab];
  }

  setResult(tab: OptimizeTabKey, result: TabResult): void {
    this.cache.update((current) => ({ ...current, [tab]: result }));
  }

  allResults(): Partial<Record<OptimizeTabKey, TabResult>> {
    return this.cache();
  }

  /**
   * Runs the single combined Gemini request for the uploaded photo and populates every tab's
   * cache entry at once. Called automatically after upload; also exposed for the "Retry" action
   * shown on any tab if the call fails.
   */
  generateAll(): void {
    const base64 = this.imageBase64();
    const mimeType = this.imageMimeType();
    if (!base64 || !mimeType || this.isGenerating()) return;

    this.generationError.set(null);
    this.isGenerating.set(true);
    this.gemini
      .extractAllListings(base64, mimeType)
      .then((data) => this.cache.set(data))
      .catch((err) => this.generationError.set(formatGeminiError(err)))
      .finally(() => this.isGenerating.set(false));
  }

  reset(): void {
    this.imagePreview.set(null);
    this.imageBase64.set(null);
    this.imageMimeType.set(null);
    this.galleryImages.set([]);
    this.cache.set({});
    this.generationError.set(null);
    this.isGenerating.set(false);
  }
}
