import { ChangeDetectionStrategy, Component, DestroyRef, Injector, computed, effect, inject, runInInjectionContext, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { BatchCommon, BatchItemView, BatchService, BatchView } from '../../../services/batch';
import { GeminiService } from '../../../services/gemini';
import { LanguageService } from '../../../services/language';
import { DraftResults, Listing, ListingService } from '../../../services/listing';
import { WalletService } from '../../../services/wallet';
import { ApiError } from '../../../services/api';
import { resizeImage } from '../../../utils/image';
import { hasRealVariants, totalStock, Variant, variantLabel } from '../../../config/size-presets';
import { VariantEditor } from '../variants/variant-editor';
import { CreateAmazonListingDialog } from '../inventory/create-amazon-listing-dialog';

/** Photos are shrunk on the phone before upload (longest side). */
export const BATCH_PHOTO_MAX_PX = 1600;

interface Photo {
  id: string;
  dataUrl: string;
}

type Step = 'pick' | 'group' | 'details' | 'confirm' | 'upload' | 'progress' | 'review';

/**
 * "Add many products": up to 20 photos → up to 20 listings.
 * pick photos → group photos of the same product → common details (+ sizes) → coin cost →
 * upload → progress (runs on the server; the seller may leave) → review & approve → publish /
 * bulk files / inventory.
 */
@Component({
  selector: 'app-batch-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, RouterLink, VariantEditor],
  templateUrl: './batch-page.html',
  styleUrl: './batch-page.scss',
})
export class BatchPage {
  protected readonly i18n = inject(LanguageService);
  protected readonly batchService = inject(BatchService);
  private readonly gemini = inject(GeminiService);
  private readonly listings = inject(ListingService);
  private readonly wallet = inject(WalletService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  protected readonly t = (en: string, hi: string) => this.i18n.t(en, hi);
  protected readonly label = variantLabel;

  readonly step = signal<Step>('pick');
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly maxPhotos = signal(20);
  readonly balance = signal(0);
  readonly cost = signal(1);

  // ---- pick + group ----
  readonly photos = signal<Photo[]>([]);
  /** Products: lists of photo ids, first = main photo. */
  readonly groups = signal<string[][]>([]);
  readonly preparing = signal(0);
  readonly selectMode = signal(false);
  readonly selected = signal<ReadonlySet<number>>(new Set());
  readonly openGroup = signal<number | null>(null);
  private dragFrom: number | null = null;
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private pressFired = false;

  // ---- common details ----
  readonly category = signal('');
  readonly brand = signal('');
  readonly price = signal('');
  readonly mrp = signal('');
  readonly costPrice = signal('');
  readonly gstHandling = signal<'inclusive' | 'exclusive'>('inclusive');
  readonly sizeVariants = signal<Variant[]>([]);
  readonly sizePreset = signal<string | null>(null);
  readonly plainStock = signal('');
  readonly lowStock = signal('');

  // ---- confirm ----
  readonly excluded = signal<ReadonlySet<number>>(new Set());
  readonly chosen = computed(() => this.groups().map((g, i) => ({ photos: g, index: i })).filter((g) => !this.excluded().has(g.index)));
  readonly needed = computed(() => this.chosen().length * this.cost());
  readonly enough = computed(() => this.needed() <= this.balance());

  // ---- upload / progress / review ----
  readonly uploaded = signal(0);
  readonly uploadTotal = signal(0);
  readonly batch = computed(() => this.batchService.active());
  readonly readyItems = computed(() => (this.batch()?.items ?? []).filter((i) => i.status === 'ready' && i.listing));
  readonly approvedItems = computed(() => this.readyItems().filter((i) => i.approved));
  readonly busy = signal<string | null>(null);
  readonly editing = signal<string | null>(null);
  readonly editTitle = signal('');
  readonly editPrice = signal('');
  readonly editMrp = signal('');
  readonly editVariants = signal<Variant[]>([]);
  readonly editStock = signal('');
  readonly notice = signal<string | null>(null);

  readonly photoById = computed(() => new Map(this.photos().map((p) => [p.id, p])));

  constructor() {
    void this.init();
    // Running batch: follow it; when it finishes, show the review.
    effect(() => {
      const b = this.batchService.active();
      untracked(() => {
        if (!b) return;
        const step = this.step();
        if (step === 'progress' && b.status === 'done') {
          this.step.set('review');
          void this.batchService.markSeen(b);
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.pressTimer && clearTimeout(this.pressTimer));
  }

  private async init(): Promise<void> {
    try {
      const [defaults, current] = await Promise.all([this.batchService.defaults(), this.batchService.refresh()]);
      this.balance.set(defaults.balance);
      this.cost.set(defaults.listingCost);
      this.maxPhotos.set(defaults.maxPhotos);
      this.prefill(defaults.common);
      if (current) this.showBatch(current);
    } catch (err) {
      this.error.set((err instanceof Error && err.message) || this.t('Could not load. Please refresh.', 'Load नहीं हुआ। Page refresh करें।'));
    } finally {
      this.loading.set(false);
    }
  }

  private showBatch(b: BatchView): void {
    if (b.status === 'uploading') {
      this.notice.set(this.t('Your last upload didn’t finish. Cancel it to start again — nothing was charged.', 'पिछला upload पूरा नहीं हुआ। फिर से शुरू करने के लिए उसे cancel करें — कोई coin नहीं कटा।'));
      return;
    }
    if (b.status === 'done') {
      this.step.set('review');
      void this.batchService.markSeen(b);
    } else {
      this.step.set('progress');
      this.batchService.watch();
    }
  }

  /** "Pre-filled from last batch". */
  private prefill(c: BatchCommon): void {
    this.category.set(c.category ?? '');
    this.brand.set(c.brand ?? '');
    this.price.set(c.price ? String(c.price) : '');
    this.mrp.set(c.mrp ? String(c.mrp) : '');
    this.costPrice.set(c.costPrice !== undefined ? String(c.costPrice) : '');
    if (c.gstHandling) this.gstHandling.set(c.gstHandling);
    this.sizePreset.set(c.sizePreset ?? null);
    this.sizeVariants.set((c.sizes ?? []).map((size, i) => ({
      id: `v_c${i}`, size, colour: null, sku: '', stock: c.stock?.[size] ?? 0, price: c.sizePrices?.[size] ?? null, mrp: null, imageIds: [],
    })));
    this.plainStock.set(c.stock?.[''] !== undefined ? String(c.stock['']) : '');
    this.lowStock.set(c.lowStockThreshold !== undefined ? String(c.lowStockThreshold) : '');
  }

  // ------------------------------------------------------------------ pick

  async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter((f) => f.type.startsWith('image/'));
    input.value = '';
    if (!files.length) return;
    const room = this.maxPhotos() - this.photos().length;
    if (files.length > room) {
      this.error.set(this.t(`Up to ${this.maxPhotos()} photos — the first ${room} were added.`, `ज़्यादा से ज़्यादा ${this.maxPhotos()} photos — पहली ${room} जोड़ी गईं।`));
    } else {
      this.error.set(null);
    }
    const take = files.slice(0, Math.max(0, room));
    this.preparing.set(take.length);
    for (const file of take) {
      try {
        const raw = await readFile(file);
        const dataUrl = await resizeImage(raw, BATCH_PHOTO_MAX_PX, BATCH_PHOTO_MAX_PX, 0.82);
        const photo = { id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, dataUrl };
        this.photos.update((list) => [...list, photo]);
        // Default: 1 photo = 1 product.
        this.groups.update((g) => [...g, [photo.id]]);
      } catch {
        this.error.set(this.t('One photo couldn’t be read and was skipped.', 'एक photo पढ़ी नहीं जा सकी, छोड़ दी गई।'));
      } finally {
        this.preparing.update((n) => n - 1);
      }
    }
  }

  removePhoto(id: string): void {
    this.photos.update((list) => list.filter((p) => p.id !== id));
    this.groups.update((groups) => groups.map((g) => g.filter((x) => x !== id)).filter((g) => g.length));
    this.openGroup.set(null);
  }

  // ------------------------------------------------------------------ group

  /** Long-press a product to start selecting (then tap others and "Group"). */
  pressStart(index: number): void {
    this.pressFired = false;
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = setTimeout(() => {
      this.pressFired = true;
      this.selectMode.set(true);
      this.selected.update((s) => new Set(s).add(index));
      try { navigator.vibrate?.(30); } catch { /* not supported */ }
    }, 450);
  }

  pressEnd(): void {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = null;
  }

  tapGroup(index: number): void {
    if (this.pressFired) {
      this.pressFired = false;
      return;
    }
    if (this.selectMode()) {
      this.selected.update((s) => {
        const next = new Set(s);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
      return;
    }
    this.openGroup.set(this.openGroup() === index ? null : index);
  }

  startSelect(): void {
    this.selectMode.set(true);
    this.selected.set(new Set());
    this.openGroup.set(null);
  }

  cancelSelect(): void {
    this.selectMode.set(false);
    this.selected.set(new Set());
  }

  /** The selected products become one product (photos in the order they were tapped). */
  groupSelected(): void {
    const picked = [...this.selected()];
    if (picked.length < 2) return;
    this.mergeGroups(picked[0], picked.slice(1));
    this.cancelSelect();
  }

  private mergeGroups(target: number, others: number[]): void {
    this.groups.update((groups) => {
      const merged = [...groups[target], ...others.flatMap((i) => groups[i])];
      return groups.map((g, i) => (i === target ? merged : g)).filter((_, i) => !others.includes(i));
    });
  }

  // Desktop: drag a product onto another to group them.
  dragStart(index: number): void {
    this.dragFrom = index;
  }

  drop(index: number, event: DragEvent): void {
    event.preventDefault();
    const from = this.dragFrom;
    this.dragFrom = null;
    if (from === null || from === index) return;
    this.mergeGroups(index, [from]);
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  makeMain(groupIndex: number, photoId: string): void {
    this.groups.update((groups) => groups.map((g, i) => (i === groupIndex ? [photoId, ...g.filter((x) => x !== photoId)] : g)));
  }

  /** Every photo of this product becomes its own product again. */
  splitGroup(groupIndex: number): void {
    this.groups.update((groups) => groups.flatMap((g, i) => (i === groupIndex ? g.map((id) => [id]) : [g])));
    this.openGroup.set(null);
  }

  // ------------------------------------------------------------------ details

  readonly hasSizes = computed(() => this.sizeVariants().some((v) => v.size));

  private buildCommon(): BatchCommon | string {
    const money = (raw: string) => {
      const n = Number(String(raw).replace(/[₹,\s]/g, ''));
      return raw.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const price = money(this.price());
    const mrp = money(this.mrp());
    if (this.price().trim() && !price) return this.t('Enter a valid price.', 'सही कीमत डालें।');
    if (price && mrp && mrp < price) return this.t('MRP can’t be lower than the price.', 'MRP कीमत से कम नहीं हो सकता।');
    const common: BatchCommon = { gstHandling: this.gstHandling() };
    if (this.category().trim()) common.category = this.category().trim();
    if (this.brand().trim()) common.brand = this.brand().trim();
    if (price) common.price = price;
    if (mrp) common.mrp = mrp;
    const costPrice = money(this.costPrice());
    if (costPrice) common.costPrice = costPrice;
    const sized = this.sizeVariants().filter((v) => v.size);
    if (sized.length) {
      common.sizes = sized.map((v) => v.size!);
      common.stock = Object.fromEntries(sized.map((v) => [v.size!, v.stock]));
      const prices = sized.filter((v) => v.price);
      if (prices.length) common.sizePrices = Object.fromEntries(prices.map((v) => [v.size!, v.price!]));
      if (this.sizePreset()) common.sizePreset = this.sizePreset()!;
    } else if (this.plainStock().trim()) {
      const n = Number(this.plainStock());
      if (!Number.isInteger(n) || n < 0) return this.t('Stock must be a whole number.', 'Stock पूरी संख्या होनी चाहिए।');
      common.stock = { '': n };
    }
    if (this.lowStock().trim()) {
      const n = Number(this.lowStock());
      if (Number.isInteger(n) && n >= 0) common.lowStockThreshold = n;
    }
    return common;
  }

  goTo(step: Step): void {
    this.error.set(null);
    if (step === 'confirm') {
      const common = this.buildCommon();
      if (typeof common === 'string') {
        this.error.set(common);
        return;
      }
      // Too few coins: start with the products that fit selected.
      const fit = Math.floor(this.balance() / Math.max(1, this.cost()));
      this.excluded.set(new Set(this.groups().map((_, i) => i).filter((i) => i >= fit)));
    }
    this.step.set(step);
    window.scrollTo?.({ top: 0 });
  }

  toggleExcluded(index: number): void {
    this.excluded.update((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  // ------------------------------------------------------------------ upload + start

  async startBatch(): Promise<void> {
    const common = this.buildCommon();
    if (typeof common === 'string') {
      this.error.set(common);
      return;
    }
    const products = this.chosen();
    if (!products.length || !this.enough()) return;
    this.error.set(null);
    this.step.set('upload');
    this.batchService.askNotificationPermission();
    const { prompt, schema } = this.gemini.buildAllListingsRequest();
    let batchId: string | null = null;
    try {
      const created = await this.batchService.create({ prompt, schema, items: products.map((p) => ({ photoCount: p.photos.length })), common });
      batchId = created.id;
      const jobs = created.items.flatMap((item) => products[item.index].photos.map((photoId, n) => ({ item, photoId, n })));
      this.uploadTotal.set(jobs.length);
      this.uploaded.set(0);
      // 3 uploads at a time; each one retried once.
      const queue = [...jobs];
      const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const photo = this.photoById().get(job.photoId)!;
          await this.batchService.uploadPhoto(batchId!, job.item.id, job.n, photo.dataUrl)
            .catch(() => this.batchService.uploadPhoto(batchId!, job!.item.id, job!.n, photo.dataUrl));
          this.uploaded.update((n) => n + 1);
        }
      });
      await Promise.all(workers);
      await this.batchService.start(batchId);
      this.step.set('progress');
      void this.wallet.load();
    } catch (err) {
      const data = (err as ApiError)?.data as { code?: string; balance?: number } | undefined;
      if (data?.code === 'NOT_ENOUGH_COINS' && typeof data.balance === 'number') this.balance.set(data.balance);
      if (data?.code === 'ACTIVE_BATCH') {
        await this.batchService.refresh();
        const b = this.batchService.active();
        if (b) this.showBatch(b);
      } else {
        if (batchId) await this.batchService.cancel(batchId).catch(() => undefined);
        this.step.set('confirm');
      }
      this.error.set((err instanceof Error && err.message) || this.t('Upload failed. Check your internet and try again.', 'Upload नहीं हुआ। Internet जांचें और फिर कोशिश करें।'));
    }
  }

  async cancelUnfinished(): Promise<void> {
    const b = this.batch();
    if (!b) return;
    await this.batchService.cancel(b.id).catch(() => undefined);
    this.notice.set(null);
    this.step.set('pick');
  }

  // ------------------------------------------------------------------ progress

  statusText(item: BatchItemView): string {
    switch (item.status) {
      case 'queued':
      case 'uploading': return this.t('Waiting', 'इंतज़ार');
      case 'generating': return this.t('Generating…', 'बन रही है…');
      case 'ready': return this.t('Ready', 'तैयार');
      default: return this.t('Failed', 'नहीं बनी');
    }
  }

  async retry(item: BatchItemView): Promise<void> {
    const b = this.batch();
    if (!b) return;
    this.busy.set(item.id);
    try {
      await this.batchService.retry(b.id, item.id);
      this.step.set('progress');
    } catch (err) {
      this.snack((err instanceof Error && err.message) || this.t('Could not retry.', 'दोबारा नहीं हो सका।'));
    } finally {
      this.busy.set(null);
    }
  }

  newBatch(): void {
    this.photos.set([]);
    this.groups.set([]);
    this.excluded.set(new Set());
    this.batchService.active.set(null);
    this.step.set('pick');
    void this.batchService.defaults().then((d) => {
      this.balance.set(d.balance);
      this.prefill(d.common);
    }).catch(() => undefined);
  }

  // ------------------------------------------------------------------ review

  async approve(item: BatchItemView | null, approved = true): Promise<void> {
    const b = this.batch();
    if (!b) return;
    this.busy.set(item?.id ?? 'all');
    try {
      await this.batchService.approve(b.id, item ? [item.id] : undefined, approved);
    } finally {
      this.busy.set(null);
    }
  }

  async startEdit(item: BatchItemView): Promise<void> {
    if (!item.listing) return;
    if (this.editing() === item.id) {
      this.editing.set(null);
      return;
    }
    this.editing.set(item.id);
    this.editTitle.set(item.listing.title);
    this.editPrice.set(item.listing.price ? String(item.listing.price) : '');
    this.editMrp.set(item.listing.mrp ? String(item.listing.mrp) : '');
    this.editVariants.set(item.listing.variants ? item.listing.variants.map((v) => ({ ...v })) : []);
    this.editStock.set(item.listing.stock !== null ? String(item.listing.stock) : '');
  }

  async saveEdit(item: BatchItemView): Promise<void> {
    if (!item.listing) return;
    this.busy.set(item.id);
    try {
      const draft = await this.listings.getDraft(item.listing.id);
      const results: DraftResults = JSON.parse(JSON.stringify(draft.results ?? {}));
      const general = (results['general'] ??= {});
      const set = (key: string, value: string) => {
        const existing = general[key];
        general[key] = { values: [value, ...(existing?.values ?? []).slice(1).filter((v) => v !== value)], confidence: existing?.confidence ?? 0, reason: existing?.reason ?? 'Entered by seller.' };
      };
      if (this.editTitle().trim()) set('productTitle', this.editTitle().trim());
      if (this.editPrice().trim()) set('sellingPrice', this.editPrice().trim());
      if (this.editMrp().trim()) set('mrp', this.editMrp().trim());
      const sized = hasRealVariants(this.editVariants());
      set('stock', sized ? String(totalStock(this.editVariants())) : this.editStock().trim() || '0');
      await this.listings.updateDraft(item.listing.id, { results, variants: sized ? this.editVariants() : null });
      const b = this.batch();
      if (b) this.batchService.active.set(await this.batchService.get(b.id));
      this.editing.set(null);
      this.snack(this.t('Saved', 'Save हो गया'));
    } catch (err) {
      this.snack((err instanceof Error && err.message) || this.t('Could not save.', 'Save नहीं हुआ।'));
    } finally {
      this.busy.set(null);
    }
  }

  openFullEditor(item: BatchItemView): void {
    if (item.listing) void this.router.navigate(['/optimize/general'], { queryParams: { id: item.listing.id } });
  }

  /** Adds approved products to Inventory (needed before publishing to Amazon). */
  async addToInventory(): Promise<string[]> {
    const b = this.batch();
    if (!b || !this.approvedItems().length) return [];
    this.busy.set('inventory');
    try {
      const { results } = await this.batchService.addToInventory(b.id, this.approvedItems().map((i) => i.id));
      const failed = results.filter((r) => !r.ok);
      const ok = results.length - failed.length;
      this.snack(failed.length
        ? this.t(`${ok} added to Inventory. ${failed.length} need a price first.`, `${ok} Inventory में जुड़े। ${failed.length} में पहले कीमत भरें।`)
        : this.t(`${ok} added to Inventory`, `${ok} Inventory में जुड़े`));
      void this.wallet.load();
      return results.filter((r) => r.ok && r.inventoryListingId).map((r) => r.inventoryListingId!);
    } catch (err) {
      this.snack((err instanceof Error && err.message) || this.t('Could not add to Inventory.', 'Inventory में नहीं जुड़ा।'));
      return [];
    } finally {
      this.busy.set(null);
    }
  }

  /** "Publish to Amazon": the existing Amazon flow, one product after another. */
  async publishToAmazon(): Promise<void> {
    const ids = await this.addToInventory();
    const dialog = runInInjectionContext(this.injector, () => inject(MatDialog));
    let published = 0;
    for (const id of ids) {
      const listing = await this.listings.getListing(id).catch(() => null) as Listing | null;
      if (!listing) continue;
      const created = await firstValueFrom(dialog.open<CreateAmazonListingDialog, Listing, boolean>(CreateAmazonListingDialog, { data: { ...listing, id }, width: '560px', maxWidth: '95vw' }).afterClosed());
      if (created) published += 1;
      else if (!confirm(this.t('Continue with the next product?', 'अगले product पर चलें?'))) break;
    }
    if (published) this.snack(this.t(`${published} published to Amazon`, `${published} Amazon पर publish हुए`));
  }

  downloadFile(marketplace: 'meesho' | 'flipkart'): void {
    const ids = this.approvedItems().map((i) => i.listing!.id);
    if (!ids.length) return;
    void this.router.navigate(['/optimize/bulk-upload'], { queryParams: { marketplace, ids: ids.join(',') } });
  }

  sizesText(item: BatchItemView): string {
    const v = item.listing?.variants;
    if (!v?.length) return '';
    const sizes = [...new Set(v.map((x) => x.size).filter(Boolean))];
    const colours = [...new Set(v.map((x) => x.colour).filter(Boolean))];
    return [colours.join(', '), sizes.join(' · ')].filter(Boolean).join(' — ');
  }

  private snack(text: string): void {
    runInInjectionContext(this.injector, () => inject(MatSnackBar)).open(text, 'OK', { duration: 4000 });
  }
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}
