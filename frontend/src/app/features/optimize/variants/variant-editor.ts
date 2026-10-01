import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LanguageService } from '../../../services/language';
import { ListingService, SizeChart } from '../../../services/listing';
import {
  hasRealVariants, newVariantId, SIZE_PRESETS, SizePresetId, suggestSizePreset, totalStock, Variant, variantLabel,
} from '../../../config/size-presets';

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * "Sizes & colours": pick a size set (the AI's category suggests one), tick sizes, add colours,
 * then stock per size (with "Same stock for all") and optionally a price per size. An optional
 * size chart is saved once per brand + category and reused.
 *
 * No sizes and no colours = a plain product: `variants` is empty.
 */
@Component({
  selector: 'app-variant-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './variant-editor.html',
  styleUrl: './variant-editor.scss',
})
export class VariantEditor {
  protected readonly i18n = inject(LanguageService);
  private readonly listings = inject(ListingService);
  protected readonly t = (en: string, hi: string) => this.i18n.t(en, hi);
  protected readonly presets = SIZE_PRESETS;
  protected readonly label = variantLabel;

  readonly variants = model<Variant[]>([]);
  readonly preset = model<string | null>(null);
  readonly category = input('');
  readonly title = input('');
  readonly brand = input('');
  /** Batch common details: colours are named by the AI per photo, so they're not asked here. */
  readonly allowColours = input(true);
  readonly showSizeChart = input(true);
  /** Inventory edit: show and edit each size's SKU. */
  readonly showSkus = input(false);
  /** Sizes stay fixed (inventory edit of a product already on a marketplace). */
  readonly lockSizes = input(false);

  readonly suggested = computed<SizePresetId | null>(() => suggestSizePreset(this.category(), this.title()));
  readonly sizes = computed(() => unique(this.variants().map((v) => v.size)));
  readonly colours = computed(() => unique(this.variants().map((v) => v.colour)));
  readonly presetSizes = computed(() => SIZE_PRESETS.find((p) => p.id === this.preset())?.sizes ?? []);
  /** Preset sizes plus any custom ones, for the toggle chips. */
  readonly sizeChoices = computed(() => unique([...this.presetSizes(), ...this.sizes()]));
  readonly total = computed(() => totalStock(this.variants()));
  readonly hasVariants = computed(() => hasRealVariants(this.variants()));
  readonly perSizePrice = signal(false);
  readonly sameStock = signal<number | null>(null);
  readonly customSize = signal('');
  readonly newColour = signal('');

  /** Rows grouped by colour (one group when there are no colours). */
  readonly groups = computed(() => {
    const colours = this.colours();
    const list = colours.length ? colours : [null];
    return list.map((colour) => ({ colour, rows: this.variants().filter((v) => norm(v.colour) === norm(colour)) }));
  });

  // ---- size chart ----
  readonly chartOpen = signal(false);
  readonly chart = signal<SizeChart | null>(null);
  readonly chartMessage = signal<{ ok: boolean; text: string } | null>(null);
  readonly chartSaving = signal(false);

  constructor() {
    queueMicrotask(() => this.perSizePrice.set(this.variants().some((v) => v.price)));
  }

  choosePreset(id: string | null): void {
    if (this.lockSizes()) return;
    this.preset.set(id);
    if (id === null) {
      this.rebuild([], this.colours());
      return;
    }
    if (id === 'custom') return;
    this.rebuild(SIZE_PRESETS.find((p) => p.id === id)?.sizes ?? [], this.colours());
  }

  toggleSize(size: string): void {
    if (this.lockSizes()) return;
    const on = this.sizes().some((s) => norm(s) === norm(size));
    const order = this.sizeChoices();
    const next = on ? this.sizes().filter((s) => norm(s) !== norm(size)) : order.filter((s) => norm(s) === norm(size) || this.sizes().some((x) => norm(x) === norm(s)));
    this.rebuild(next, this.colours());
  }

  addCustomSizes(): void {
    const added = this.customSize().split(',').map((s) => s.trim().slice(0, 20)).filter(Boolean);
    if (!added.length) return;
    if (!this.preset()) this.preset.set('custom');
    this.rebuild(unique([...this.sizes(), ...added]), this.colours());
    this.customSize.set('');
  }

  addColour(): void {
    const name = this.newColour().trim().slice(0, 30);
    if (!name || this.colours().some((c) => norm(c) === norm(name))) {
      this.newColour.set('');
      return;
    }
    this.rebuild(this.sizes(), [...this.colours(), name]);
    this.newColour.set('');
  }

  removeColour(colour: string): void {
    this.rebuild(this.sizes(), this.colours().filter((c) => norm(c) !== norm(colour)));
  }

  setStock(id: string, raw: string): void {
    const n = Math.max(0, Math.min(1_000_000, Math.trunc(Number(raw) || 0)));
    this.variants.update((list) => list.map((v) => (v.id === id ? { ...v, stock: n } : v)));
  }

  setSku(id: string, raw: string): void {
    const sku = raw.trim().slice(0, 40);
    this.variants.update((list) => list.map((v) => (v.id === id ? { ...v, sku } : v)));
  }

  applySameStock(): void {
    const n = this.sameStock();
    if (n === null || !Number.isFinite(n) || n < 0) return;
    const stock = Math.trunc(n);
    this.variants.update((list) => list.map((v) => ({ ...v, stock })));
  }

  /** Price per size applies to that size in every colour. */
  setSizePrice(size: string | null, raw: string): void {
    const n = Number(String(raw).replace(/[₹,\s]/g, ''));
    const price = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
    this.variants.update((list) => list.map((v) => (norm(v.size) === norm(size) ? { ...v, price } : v)));
  }

  sizePrice(size: string | null): number | null {
    return this.variants().find((v) => norm(v.size) === norm(size))?.price ?? null;
  }

  togglePerSizePrice(on: boolean): void {
    this.perSizePrice.set(on);
    if (!on) this.variants.update((list) => list.map((v) => ({ ...v, price: null })));
  }

  isSizeOn(size: string): boolean {
    return this.sizes().some((s) => norm(s) === norm(size));
  }

  /** New size × colour grid, keeping stock, price, SKU and photos of combinations that stay. */
  private rebuild(sizes: string[], colours: string[]): void {
    const current = this.variants();
    if (!sizes.length && !colours.length) {
      this.variants.set([]);
      return;
    }
    const colourList: (string | null)[] = colours.length ? colours : [null];
    const sizeList: (string | null)[] = sizes.length ? sizes : [null];
    const next: Variant[] = [];
    for (const colour of colourList) {
      const colourImages = current.find((v) => norm(v.colour) === norm(colour) && v.imageIds?.length)?.imageIds ?? [];
      for (const size of sizeList) {
        const existing = current.find((v) => norm(v.colour) === norm(colour) && norm(v.size) === norm(size));
        next.push(existing ?? {
          id: newVariantId(),
          size,
          colour,
          sku: '',
          stock: 0,
          price: size ? current.find((v) => norm(v.size) === norm(size))?.price ?? null : null,
          mrp: null,
          imageIds: colourImages,
        });
      }
    }
    this.variants.set(next);
  }

  // ---- size chart ----

  async toggleChart(): Promise<void> {
    const open = !this.chartOpen();
    this.chartOpen.set(open);
    if (!open || this.chart()) return;
    const base: SizeChart = { brand: this.brand(), category: this.category(), unit: 'in', measures: ['Chest', 'Length'], rows: [] };
    try {
      const saved = this.category() ? await this.listings.getSizeChart(this.brand(), this.category()) : null;
      this.chart.set(this.withCurrentSizes(saved ?? base));
    } catch {
      this.chart.set(this.withCurrentSizes(base));
    }
  }

  private withCurrentSizes(chart: SizeChart): SizeChart {
    const rows = this.sizes().map((size) => chart.rows.find((r) => norm(r.size) === norm(size)) ?? { size, values: chart.measures.map(() => '') });
    return { ...chart, rows: rows.length ? rows : chart.rows };
  }

  setChartValue(row: number, col: number, value: string): void {
    this.chart.update((c) => c && { ...c, rows: c.rows.map((r, i) => (i === row ? { ...r, values: r.values.map((v, j) => (j === col ? value.trim().slice(0, 12) : v)) } : r)) });
  }

  setChartMeasure(col: number, value: string): void {
    this.chart.update((c) => c && { ...c, measures: c.measures.map((m, j) => (j === col ? value.trim().slice(0, 30) : m)) });
  }

  setChartUnit(unit: 'in' | 'cm'): void {
    this.chart.update((c) => c && { ...c, unit });
  }

  async saveChart(): Promise<void> {
    const chart = this.chart();
    if (!chart) return;
    this.chartSaving.set(true);
    this.chartMessage.set(null);
    try {
      const saved = await this.listings.saveSizeChart({ ...chart, brand: this.brand(), category: this.category() });
      this.chart.set(saved);
      this.chartMessage.set({ ok: true, text: this.t('Saved — used for every product of this brand and category.', 'Save हो गया — इस brand और category के हर product में लगेगा।') });
    } catch (err) {
      this.chartMessage.set({ ok: false, text: (err instanceof Error && err.message) || this.t('Could not save.', 'Save नहीं हुआ।') });
    } finally {
      this.chartSaving.set(false);
    }
  }
}

function unique(values: (string | null)[]): string[] {
  const out: string[] = [];
  for (const v of values) if (v && !out.some((x) => norm(x) === norm(v))) out.push(v);
  return out;
}
