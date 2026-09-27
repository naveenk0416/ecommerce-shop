import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AiFieldExtraction, formatGeminiError, GeminiService } from '../../services/gemini';
import { DraftResults, ListingService } from '../../services/listing';
import { normalizeHashtags } from '../../utils/hashtags';
import { resizeImage } from '../../utils/image';
import { SELLER_FIELD_KEYS } from './listing-summary.model';

export type OptimizeTabKey = 'general' | 'amazon' | 'flipkart' | 'meesho' | 'instagram';

export type TabResult = Record<string, AiFieldExtraction>;

export type DraftSaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Edits are saved this long after the seller stops typing. */
const SAVE_DEBOUNCE_MS = 1000;

/**
 * Shared per-session state for the /optimize route tree: the product photo and every tab's
 * generated content. Provided only on the /optimize route tree.
 *
 * Generation is a single combined Gemini call covering every tab (GeminiService.extractAllListings),
 * fired once per uploaded photo — tabs only read from `cache`.
 *
 * Everything is also saved to the backend as a listing draft (My Listings): created as soon as
 * generation finishes, then updated on every edit (debounced). The draft id is kept in the URL
 * (?id=…) so refresh and back/forward reload the same listing.
 */
@Injectable()
export class OptimizeSessionService {
  private readonly gemini = inject(GeminiService);
  private readonly listingService = inject(ListingService);
  private readonly router = inject(Router);

  /** Data URL for a fresh upload, or the draft's image URL once loaded from the backend. */
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

  // ---- Draft persistence ----
  draftId = signal<string | null>(null);
  draftStatus = signal<'draft' | 'saved'>('draft');
  inventoryListingId = signal<string | null>(null);
  saveState = signal<DraftSaveState>('idle');
  loadingDraft = signal(false);
  loadError = signal<string | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private creating: Promise<void> | null = null;

  hasImage(): boolean {
    return this.imagePreview() !== null;
  }

  /** A brand-new photo starts a brand-new listing (new draft). */
  setImage(dataUrl: string, base64: string, mimeType: string): void {
    this.clearDraft();
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
    this.scheduleSave();
  }

  allResults(): Partial<Record<OptimizeTabKey, TabResult>> {
    return this.cache();
  }

  /**
   * Records a seller edit (or a seller-entered value such as price or stock) as the field's
   * primary value and saves the draft shortly after. Other AI candidates are kept for Regenerate.
   */
  updateField(tab: OptimizeTabKey, key: string, value: string): void {
    const current = this.cache()[tab] ?? {};
    const existing = current[key];
    if (existing?.values?.[0] === value) return;
    const values = existing ? [value, ...existing.values.slice(1)] : [value];
    this.cache.update((all) => ({
      ...all,
      [tab]: { ...current, [key]: { values, confidence: existing?.confidence ?? 0, reason: existing?.reason ?? 'Entered by seller.' } },
    }));
    this.scheduleSave();
  }

  /**
   * Runs the single combined Gemini request for the photo and populates every tab at once, then
   * saves the result as a draft. Also used by every tab's "Retry"/"Regenerate".
   */
  generateAll(): void {
    if (this.isGenerating()) return;
    this.generationError.set(null);
    this.isGenerating.set(true);
    this.ensureImageBytes()
      .then(({ base64, mimeType }) => this.gemini.extractAllListings(base64, mimeType))
      .then((data) => {
        const next = this.enforceLimits(data as Partial<Record<OptimizeTabKey, TabResult>>);
        // Regenerating must not wipe what the seller typed (prices, stock).
        const previousGeneral = this.cache().general ?? {};
        const sellerValues = Object.fromEntries(SELLER_FIELD_KEYS.filter((k) => previousGeneral[k]).map((k) => [k, previousGeneral[k]]));
        this.cache.set({ ...next, general: { ...(next.general ?? {}), ...sellerValues } });
        return this.saveNow();
      })
      .catch((err) => this.generationError.set(formatGeminiError(err)))
      .finally(() => this.isGenerating.set(false));
  }

  /** Loads a saved draft (from ?id= in the URL, or "Open" in My Listings). */
  async loadDraft(id: string): Promise<void> {
    if (id === this.draftId()) return;
    this.cancelPendingSave();
    this.loadingDraft.set(true);
    this.loadError.set(null);
    try {
      const draft = await this.listingService.getDraft(id);
      this.cache.set((draft.results ?? {}) as Partial<Record<OptimizeTabKey, TabResult>>);
      this.draftId.set(draft.id);
      this.draftStatus.set(draft.status);
      this.inventoryListingId.set(draft.inventoryListingId);
      this.imagePreview.set(draft.imageUrl);
      this.imageBase64.set(null);
      this.imageMimeType.set(null);
      this.galleryImages.set(draft.imageUrl ? [draft.imageUrl] : []);
      this.generationError.set(null);
      this.saveState.set('saved');
    } catch (error) {
      this.loadError.set((error instanceof Error && error.message) || 'Could not open this listing.');
    } finally {
      this.loadingDraft.set(false);
    }
  }

  /** Called after "Save to Inventory" links this listing to an inventory item. */
  async markSavedToInventory(inventoryListingId: string): Promise<void> {
    this.inventoryListingId.set(inventoryListingId);
    this.draftStatus.set('saved');
    await this.saveNow();
    const id = this.draftId();
    if (id) await this.listingService.updateDraft(id, { status: 'saved', inventoryListingId });
  }

  /** Saves immediately (used after generation and before leaving the page). */
  async saveNow(): Promise<void> {
    this.cancelPendingSave();
    if (!Object.keys(this.cache()).length) return;
    this.saveState.set('saving');
    try {
      if (!this.draftId()) {
        await this.createDraft();
      } else {
        await this.listingService.updateDraft(this.draftId()!, { results: this.cache() as DraftResults });
      }
      this.saveState.set('saved');
    } catch (error) {
      console.error('Draft save failed', error);
      this.saveState.set('error');
    }
  }

  reset(): void {
    this.clearDraft();
    this.imagePreview.set(null);
    this.imageBase64.set(null);
    this.imageMimeType.set(null);
    this.galleryImages.set([]);
    this.cache.set({});
    this.generationError.set(null);
    this.isGenerating.set(false);
  }

  private clearDraft(): void {
    this.cancelPendingSave();
    this.draftId.set(null);
    this.draftStatus.set('draft');
    this.inventoryListingId.set(null);
    this.saveState.set('idle');
    this.loadError.set(null);
  }

  private scheduleSave(): void {
    if (!Object.keys(this.cache()).length) return;
    this.cancelPendingSave();
    this.saveState.set('saving');
    this.saveTimer = setTimeout(() => void this.saveNow(), SAVE_DEBOUNCE_MS);
  }

  private cancelPendingSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  private async createDraft(): Promise<void> {
    // Two saves racing before the first POST returns must not create two drafts.
    if (this.creating) return this.creating;
    this.creating = (async () => {
      const image = await this.imageForStorage();
      const draft = await this.listingService.createDraft({ results: this.cache() as DraftResults, image });
      this.draftId.set(draft.id);
      this.draftStatus.set(draft.status);
      if (draft.imageUrl) this.galleryImages.update((imgs) => (imgs.length ? imgs : [draft.imageUrl!]));
      this.putDraftIdInUrl(draft.id);
    })();
    try {
      await this.creating;
    } finally {
      this.creating = null;
    }
  }

  /** Keeps ?id=<draft> in the URL (replacing history, so Back still goes where the seller came from). */
  private putDraftIdInUrl(id: string): void {
    const tree = this.router.parseUrl(this.router.url);
    if (tree.queryParams['id'] === id) return;
    tree.queryParams = { ...tree.queryParams, id };
    void this.router.navigateByUrl(tree, { replaceUrl: true });
  }

  /** A downscaled copy of the uploaded photo for the draft (keeps requests well under the API limit). */
  private async imageForStorage(): Promise<string | undefined> {
    const preview = this.imagePreview();
    if (!preview?.startsWith('data:')) return undefined;
    try {
      return await resizeImage(preview, 1600, 1600, 0.85);
    } catch {
      return preview;
    }
  }

  /** Gemini needs the raw bytes; a draft reopened from My Listings only has its image URL. */
  private async ensureImageBytes(): Promise<{ base64: string; mimeType: string }> {
    const base64 = this.imageBase64();
    const mimeType = this.imageMimeType();
    if (base64 && mimeType) return { base64, mimeType };
    const url = this.imagePreview();
    if (!url) throw new Error('Upload a product photo first.');
    const blob = await (await fetch(url)).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read the product photo.'));
      reader.readAsDataURL(blob);
    });
    const bytes = dataUrl.split(',')[1] ?? '';
    const type = blob.type || 'image/jpeg';
    this.imageBase64.set(bytes);
    this.imageMimeType.set(type);
    return { base64: bytes, mimeType: type };
  }

  /**
   * Post-generation rules the model doesn't reliably follow: Instagram hashtags are capped at 20
   * (Instagram allows 30 per post) and de-duplicated; trending tags never repeat the main set, so
   * both together stay within 30.
   */
  private enforceLimits(data: Partial<Record<OptimizeTabKey, TabResult>>): Partial<Record<OptimizeTabKey, TabResult>> {
    const ig = data.instagram;
    if (!ig) return data;
    const hashtags = ig['hashtags'];
    const trending = ig['trendingHashtags'];
    const mainValues = (hashtags?.values ?? []).map((v) => normalizeHashtags(v, 20));
    return {
      ...data,
      instagram: {
        ...ig,
        ...(hashtags ? { hashtags: { ...hashtags, values: mainValues.map((tags) => tags.join(' ')) } } : {}),
        ...(trending
          ? { trendingHashtags: { ...trending, values: trending.values.map((v, i) => normalizeHashtags(v, 10, mainValues[i] ?? mainValues[0] ?? []).join(' ')) } }
          : {}),
      },
    };
  }
}
