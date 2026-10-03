import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiError } from '../../../services/api';
import {
  BulkCell, BulkColumn, BulkErrorRow, BulkMarketplace, BulkReport, BulkRow, BulkTemplateInfo, BulkUploadService, MAX_TEMPLATE_BYTES, SellerProfile,
} from '../../../services/bulk-upload';
import { LanguageService } from '../../../services/language';
import { ListingDraftSummary, ListingService } from '../../../services/listing';

type Step = 1 | 2 | 3 | 4 | 5;

/**
 * Meesho rejects a row unless MRP is at least 10% above the Meesho price ("MRP should be greater
 * than listing price by 35.00 Rs" for ₹350) — so resellers can add their margin.
 */
export const MEESHO_MRP_MARGIN = 0.1;

export interface PriceProblem {
  rowIndex: number;
  title: string;
  price: number;
  mrp: number;
  /** Lowest MRP the marketplace accepts for this price. */
  minMrp: number;
}

const money = (v: string | undefined) => {
  const n = Number(String(v ?? '').replace(/[₹,\s]/g, ''));
  return v && Number.isFinite(n) && n > 0 ? n : null;
};

/** Rows the marketplace will reject for their price / MRP. */
export function priceProblems(rows: BulkRow[], columns: BulkColumn[], marketplace: BulkMarketplace | null): PriceProblem[] {
  const priceCol = columns.find((c) => c.field === 'price');
  const mrpCol = columns.find((c) => c.field === 'mrp');
  if (!priceCol || !mrpCol) return [];
  const out: PriceProblem[] = [];
  rows.forEach((row, rowIndex) => {
    const price = money(row.cells[priceCol.col]?.value);
    const mrp = money(row.cells[mrpCol.col]?.value);
    if (!price || !mrp) return;
    // Rounded to paise first: 350 × 1.1 is 385.00000000000006 in floating point.
    const minMrp = marketplace === 'meesho' ? Math.ceil(Math.round(price * (1 + MEESHO_MRP_MARGIN) * 100) / 100) : price;
    if (mrp < minMrp) out.push({ rowIndex, title: row.variantLabel ? `${row.title} (${row.variantLabel})` : row.title, price, mrp, minMrp });
  });
  return out;
}

/** What the marketplace said about one of our rows (from its error file). */
export interface MarketError {
  status: string;
  messages: Array<{ text: string; col: number | null }>;
}

/** Error-file rows → our rows: by SKU, then product name, then position in the file. */
export function matchMarketErrors(errors: BulkErrorRow[], rows: BulkRow[], columns: BulkColumn[]): { byRow: Map<string, MarketError>; unmatched: BulkErrorRow[] } {
  const skuCol = columns.find((c) => c.field === 'sku')?.col;
  const titleCol = columns.find((c) => c.field === 'title')?.col;
  const value = (row: BulkRow, col: number | undefined) => (col === undefined ? '' : (row.cells[col]?.value ?? '').trim().toLowerCase());
  const byRow = new Map<string, MarketError>();
  const unmatched: BulkErrorRow[] = [];
  for (const e of errors) {
    const sku = e.sku.trim().toLowerCase();
    const title = e.title.trim().toLowerCase();
    const free = (r: BulkRow | undefined): r is BulkRow => !!r && !byRow.has(r.rowKey);
    const atIndex = rows[e.index];
    const row = (sku ? rows.find((r) => free(r) && value(r, skuCol) === sku) : undefined)
      ?? (title ? rows.find((r) => free(r) && value(r, titleCol) === title) : undefined)
      // Same position, unless that row's SKU says it's a different product.
      ?? (free(atIndex) && (!sku || !value(atIndex, skuCol)) ? atIndex : undefined);
    if (row) byRow.set(row.rowKey, { status: e.status, messages: e.messages });
    else unmatched.push(e);
  }
  return { byRow, unmatched };
}

const normalize = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const stem = (w: string) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '');
const tokens = (s: string) => normalize(s).split(' ').filter((w) => w.length > 1).map(stem);

/** Same rule as the server: the listing's category words should overlap the template's category. */
function categoryMatches(templateCategory: string | null, listingCategory: string | undefined): boolean {
  if (!templateCategory || !listingCategory) return true;
  const a = new Set(tokens(templateCategory));
  return tokens(listingCategory).some((t) => a.has(t) || [...a].some((x) => x.length > 3 && (t.startsWith(x) || x.startsWith(t))));
}

/**
 * "Bulk upload file": 1) Meesho or Flipkart + how to download the template, 2) upload it,
 * 3) pick listings, 4) check / edit the filled rows, 5) download and upload it on the marketplace.
 * No marketplace login, no coins.
 */
@Component({
  selector: 'app-bulk-upload',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './bulk-upload.html',
  styleUrl: './bulk-upload.css',
})
export class BulkUpload {
  protected readonly i18n = inject(LanguageService);
  private readonly bulk = inject(BulkUploadService);
  private readonly listings = inject(ListingService);
  protected readonly t = (en: string, hi: string) => this.i18n.t(en, hi);

  readonly step = signal<Step>(1);
  readonly marketplace = signal<BulkMarketplace | null>(null);
  readonly marketName = computed(() => (this.marketplace() === 'flipkart' ? 'Flipkart' : 'Meesho'));

  // Step 2
  readonly template = signal<BulkTemplateInfo | null>(null);
  readonly uploading = signal(false);
  readonly uploadError = signal<string | null>(null);
  readonly requiredCount = computed(() => this.template()?.columns.filter((c) => c.required).length ?? 0);

  // Step 3
  readonly drafts = signal<ListingDraftSummary[]>([]);
  readonly draftsLoading = signal(false);
  readonly search = signal('');
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly filteredDrafts = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.drafts().filter((d) => !q || (d.title || '').toLowerCase().includes(q) || (d.category || '').toLowerCase().includes(q));
  });
  readonly mismatchedSelected = computed(() => {
    const cat = this.template()?.category ?? null;
    return this.drafts().filter((d) => this.selected().has(d.id) && !categoryMatches(cat, d.category));
  });
  readonly maxRows = computed(() => this.template()?.maxRows ?? 100);

  // Step 4
  readonly filling = signal(false);
  readonly fillError = signal<string | null>(null);
  readonly rows = signal<BulkRow[]>([]);
  readonly report = signal<BulkReport | null>(null);
  readonly columns = computed(() => this.template()?.columns ?? []);
  readonly mustFillHeaders = computed(() => (this.report()?.emptyMandatory ?? []).map((m) => m.header).join(', '));
  readonly mustFillLeft = computed(() => {
    const req = this.columns().filter((c) => c.required);
    return this.rows().reduce((n, r) => n + req.filter((c) => !r.cells[c.col]?.value).length, 0);
  });

  /** Price / MRP the marketplace will reject (checked again after every edit). */
  readonly priceProblems = computed(() => priceProblems(this.rows(), this.columns(), this.marketplace()));
  readonly mrpCol = computed(() => this.columns().find((c) => c.field === 'mrp')?.col ?? null);

  isPriceProblem(rowIndex: number, col: BulkColumn): boolean {
    return col.col === this.mrpCol() && this.priceProblems().some((p) => p.rowIndex === rowIndex);
  }

  priceProblemText(p: PriceProblem): string {
    return this.marketplace() === 'meesho'
      ? this.t(`${p.title}: MRP ₹${p.mrp} is too low for price ₹${p.price}. Meesho needs MRP at least 10% above the price — ₹${p.minMrp} or more (or lower the price).`,
        `${p.title}: कीमत ₹${p.price} के लिए MRP ₹${p.mrp} कम है। Meesho को MRP कीमत से कम से कम 10% ज़्यादा चाहिए — ₹${p.minMrp} या उससे ज़्यादा (या कीमत कम करें)।`)
      : this.t(`${p.title}: MRP ₹${p.mrp} is lower than the price ₹${p.price}.`, `${p.title}: MRP ₹${p.mrp} कीमत ₹${p.price} से कम है।`);
  }

  // Step 5
  readonly downloading = signal(false);
  readonly downloadError = signal<string | null>(null);
  readonly downloaded = signal<string | null>(null);

  // The marketplace's error file: rows it rejected, checked again as the seller fixes them.
  readonly marketErrors = signal<ReadonlyMap<string, MarketError>>(new Map());
  /** Columns edited per row since the error file was read. */
  readonly touched = signal<ReadonlyMap<string, ReadonlySet<number>>>(new Map());
  readonly unmatchedErrors = signal<BulkErrorRow[]>([]);
  readonly errorsUploading = signal(false);
  readonly errorsError = signal<string | null>(null);
  readonly errorsInfo = signal<string | null>(null);
  readonly marketErrorList = computed(() => {
    const errors = this.marketErrors();
    return this.rows()
      .map((row, i) => ({ row, i, err: errors.get(row.rowKey) }))
      .filter((x): x is { row: BulkRow; i: number; err: MarketError } => !!x.err)
      .map((x) => ({ ...x, fixed: this.isFixed(x.row, x.i, x.err) }));
  });
  readonly marketErrorsLeft = computed(() => this.marketErrorList().filter((e) => !e.fixed).length);

  /**
   * Fixed = every cell the marketplace complained about was changed (a message about no column
   * needs any change in the row), no mandatory cell it named is empty, and our own price check passes.
   */
  private isFixed(row: BulkRow, rowIndex: number, err: MarketError): boolean {
    const touched = this.touched().get(row.rowKey) ?? new Set<number>();
    const required = new Set(this.columns().filter((c) => c.required).map((c) => c.col));
    return err.messages.every((m) => (m.col === null ? touched.size > 0 : touched.has(m.col) && (!required.has(m.col) || !!row.cells[m.col]?.value)))
      && !this.priceProblems().some((p) => p.rowIndex === rowIndex);
  }

  rowFixed(rowKey: string): boolean {
    return !!this.marketErrorList().find((e) => e.row.rowKey === rowKey)?.fixed;
  }

  isMarketErrorCell(row: BulkRow, col: BulkColumn): boolean {
    const err = this.marketErrors().get(row.rowKey);
    return !!err && err.messages.some((m) => m.col === col.col) && !this.touched().get(row.rowKey)?.has(col.col);
  }

  marketErrorText(row: BulkRow, col: BulkColumn): string {
    return (this.marketErrors().get(row.rowKey)?.messages ?? []).filter((m) => m.col === col.col).map((m) => m.text).join('\n');
  }

  columnName(col: number | null): string | null {
    return col === null ? null : this.columns().find((c) => c.col === col)?.header ?? null;
  }

  rowLabel(row: BulkRow): string {
    return row.variantLabel ? `${row.title} (${row.variantLabel})` : row.title;
  }

  async onErrorFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const tpl = this.template();
    if (!file || !tpl) return;
    this.errorsError.set(null);
    this.errorsInfo.set(null);
    if (file.size > MAX_TEMPLATE_BYTES) {
      this.errorsError.set(this.t('The file is larger than 10 MB.', 'File 10 MB से बड़ी है।'));
      return;
    }
    this.errorsUploading.set(true);
    try {
      const errors = await this.bulk.uploadErrors(tpl.id, file);
      const { byRow, unmatched } = matchMarketErrors(errors, this.rows(), this.columns());
      this.marketErrors.set(byRow);
      this.touched.set(new Map());
      this.unmatchedErrors.set(unmatched);
      if (errors.length === 0) {
        this.errorsInfo.set(this.t(`No rejected rows in this file — ${this.marketName()} accepted every row.`, `इस file में कोई rejected row नहीं — ${this.marketName()} ने सब rows ले लीं।`));
        return;
      }
      this.step.set(4);
      setTimeout(() => document.getElementById('bulk-market-errors')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error) {
      const code = ((error as ApiError).data as { code?: string } | undefined)?.code;
      this.errorsError.set(
        code === 'NOT_ERROR_FILE' ? this.t(`This file has no error columns. Upload the error file ${this.marketName()} gave you for this upload.`, `इस file में error columns नहीं हैं। इस upload के लिए ${this.marketName()} से मिली error file upload करें।`)
        : code === 'BAD_FILE' ? this.t('This is not an Excel file.', 'यह Excel file नहीं है।')
        : code === 'TOO_LARGE' ? this.t('The file is larger than 10 MB.', 'File 10 MB से बड़ी है।')
        : code === 'EXPIRED' ? this.t('This template has expired (we keep it for 24 hours). Please start again.', 'यह template expire हो गया (24 घंटे तक रखते हैं)। फिर से शुरू करें।')
        : this.t('We couldn’t read this file. Please try again.', 'यह file पढ़ी नहीं जा सकी। फिर से try करें।'),
      );
    } finally {
      this.errorsUploading.set(false);
    }
  }

  // Seller profile
  readonly profile = signal<SellerProfile>({});
  readonly profileOpen = signal(false);
  readonly profileSaving = signal(false);
  readonly profileMessage = signal<{ ok: boolean; text: string } | null>(null);

  constructor() {
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    const market = params.get('marketplace');
    if (market === 'meesho' || market === 'flipkart') this.marketplace.set(market);
    const preselect = params.get('ids');
    if (preselect) this.selected.set(new Set(preselect.split(',').filter((id) => /^[a-f0-9]{24}$/.test(id))));
    this.bulk.getProfile().then((p) => this.profile.set(p)).catch(() => undefined);
  }

  chooseMarketplace(m: BulkMarketplace): void {
    this.marketplace.set(m);
    this.template.set(null);
    this.uploadError.set(null);
  }

  goTo(step: Step): void {
    this.step.set(step);
    if (step === 3 && this.drafts().length === 0) void this.loadDrafts();
  }

  // ---- Step 2: upload ----
  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const market = this.marketplace();
    if (!file || !market) return;
    this.uploadError.set(null);
    if (file.size > MAX_TEMPLATE_BYTES) {
      this.uploadError.set(this.t('The file is larger than 10 MB.', 'File 10 MB से बड़ी है।'));
      return;
    }
    this.uploading.set(true);
    try {
      this.template.set(await this.bulk.uploadTemplate(file, market));
    } catch (error) {
      const code = ((error as ApiError).data as { code?: string } | undefined)?.code;
      this.uploadError.set(
        code === 'BAD_FILE' ? this.t('This is not an Excel template. Upload the .xlsx, .xls or .xlsm file you downloaded from the marketplace.', 'यह Excel template नहीं है। Marketplace से download की हुई .xlsx, .xls या .xlsm file upload करें।')
        : code === 'TOO_LARGE' ? this.t('The file is larger than 10 MB.', 'File 10 MB से बड़ी है।')
        : code === 'DAILY_LIMIT' ? this.t('You can make 20 files a day. Please try again tomorrow.', 'एक दिन में 20 files बना सकते हैं। कल फिर try करें।')
        : code === 'UNREADABLE' ? this.t('We couldn’t read this file. Upload the template exactly as downloaded, without changing it.', 'यह file पढ़ी नहीं जा सकी। Template को बिना बदले, जैसा download हुआ वैसा ही upload करें।')
        : this.t('Upload failed. Please try again.', 'Upload नहीं हुआ। फिर से try करें।'),
      );
    } finally {
      this.uploading.set(false);
    }
  }

  // ---- Step 3: select listings ----
  private async loadDrafts(): Promise<void> {
    this.draftsLoading.set(true);
    try {
      this.drafts.set(await this.listings.listDrafts());
    } finally {
      this.draftsLoading.set(false);
    }
  }

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  toggle(id: string, on: boolean): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (on && next.size < this.maxRows()) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  selectAllShown(on: boolean): void {
    this.selected.update((set) => {
      const next = new Set(set);
      for (const d of this.filteredDrafts()) {
        if (on && next.size < this.maxRows()) next.add(d.id);
        if (!on) next.delete(d.id);
      }
      return next;
    });
  }

  mismatch(d: ListingDraftSummary): boolean {
    return !categoryMatches(this.template()?.category ?? null, d.category);
  }

  // ---- Step 4: fill + preview ----
  async fill(): Promise<void> {
    const tpl = this.template();
    const ids = this.drafts().filter((d) => this.selected().has(d.id)).map((d) => d.id);
    if (!tpl || ids.length === 0) return;
    this.filling.set(true);
    this.fillError.set(null);
    try {
      const { rows, report } = await this.bulk.fill(tpl.id, ids);
      this.rows.set(rows);
      this.report.set(report);
      this.clearMarketErrors();
      this.step.set(4);
    } catch (error) {
      const code = ((error as ApiError).data as { code?: string } | undefined)?.code;
      this.fillError.set(code === 'EXPIRED'
        ? this.t('This template has expired (we keep it for 24 hours). Please upload it again.', 'यह template expire हो गया (24 घंटे तक रखते हैं)। फिर से upload करें।')
        : this.t('Could not fill the file. Please try again.', 'File नहीं भरी जा सकी। फिर से try करें।'));
    } finally {
      this.filling.set(false);
    }
  }

  cell(row: BulkRow, col: BulkColumn): BulkCell {
    return row.cells[col.col] ?? { value: '', status: col.required ? 'must_fill' : 'empty' };
  }

  edit(rowIndex: number, col: BulkColumn, value: string): void {
    const key = this.rows()[rowIndex]?.rowKey;
    this.rows.update((rows) => rows.map((r, i) => i !== rowIndex ? r : {
      ...r,
      cells: { ...r.cells, [col.col]: { value, status: value ? 'filled' : (col.required ? 'must_fill' : 'empty') } },
    }));
    if (key && this.marketErrors().has(key)) {
      this.touched.update((m) => new Map(m).set(key, new Set(m.get(key)).add(col.col)));
    }
  }

  cellTitle(cell: BulkCell): string {
    if (cell.status === 'adjusted') return cell.from ? this.t(`Changed from “${cell.from}” to fit the list`, `List के हिसाब से “${cell.from}” से बदला`) : this.t('Chosen from the list', 'List से चुना');
    if (cell.status === 'ai') return this.t('Picked by AI from your listing — please check', 'AI ने आपकी listing से चुना — कृपया check करें');
    if (cell.status === 'must_fill') return cell.from
      ? this.t(`“${cell.from}” isn’t in this template’s list — choose a value`, `“${cell.from}” इस template की list में नहीं है — value चुनें`)
      : this.t('You must fill this', 'यह आपको भरना होगा');
    return '';
  }

  instructionText(code: string): string {
    switch (code) {
      case 'IMAGES_SEPARATE': return this.t(`This template has no image columns — upload the product photos in the ${this.marketName()} panel after the file.`, `इस template में photo के columns नहीं हैं — file के बाद ${this.marketName()} panel में photos upload करें।`);
      case 'SAVE_TO_INVENTORY_FOR_PRICE': return this.t('Some listings have no price or stock — save them to Inventory first, or type them in the table.', 'कुछ listings में price या stock नहीं है — पहले Inventory में save करें, या table में लिखें।');
      default: return code;
    }
  }

  // ---- Step 5: download ----
  async download(): Promise<void> {
    const tpl = this.template();
    if (!tpl) return;
    const problems = this.priceProblems().length;
    const rejected = this.marketErrorsLeft();
    if (problems && !confirm(this.t(
      `${problems} row(s) have an MRP that ${this.marketName()} will reject. Download anyway?`,
      `${problems} row(s) का MRP ${this.marketName()} reject करेगा। फिर भी download करें?`,
    ))) return;
    if (!problems && rejected && !confirm(this.t(
      `${rejected} row(s) ${this.marketName()} rejected are not fixed yet. Download anyway?`,
      `${this.marketName()} की reject की हुई ${rejected} row(s) अभी ठीक नहीं हुईं। फिर भी download करें?`,
    ))) return;
    this.downloading.set(true);
    this.downloadError.set(null);
    try {
      const rows = this.rows().map((r) => ({ cells: Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, c.value])) as Record<number, string> }));
      const { blob, fileName } = await this.bulk.download(tpl.id, rows);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      this.downloaded.set(fileName);
      this.step.set(5);
    } catch (error) {
      const code = ((error as ApiError).data as { code?: string } | undefined)?.code;
      this.downloadError.set(code === 'EXPIRED'
        ? this.t('This template has expired. Please upload it again.', 'यह template expire हो गया। फिर से upload करें।')
        : this.t('Could not create the file. Please try again.', 'File नहीं बन सकी। फिर से try करें।'));
    } finally {
      this.downloading.set(false);
    }
  }

  startOver(): void {
    this.step.set(1);
    this.template.set(null);
    this.rows.set([]);
    this.report.set(null);
    this.downloaded.set(null);
    this.clearMarketErrors();
  }

  private clearMarketErrors(): void {
    this.marketErrors.set(new Map());
    this.touched.set(new Map());
    this.unmatchedErrors.set([]);
    this.errorsError.set(null);
    this.errorsInfo.set(null);
  }

  // ---- Seller profile ----
  readonly profileIncomplete = computed(() => {
    const p = this.profile();
    return !p.manufacturerName || !p.countryOfOrigin;
  });

  openProfile(): void {
    this.profileOpen.set(true);
    setTimeout(() => document.getElementById('bulk-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  setProfile(key: keyof SellerProfile, value: string): void {
    this.profile.update((p) => ({ ...p, [key]: value || undefined }));
  }

  async saveProfile(): Promise<void> {
    this.profileSaving.set(true);
    this.profileMessage.set(null);
    try {
      this.profile.set(await this.bulk.saveProfile(this.profile()));
      this.profileMessage.set({ ok: true, text: this.t('Saved — used in every file.', 'Save हो गया — हर file में use होगा।') });
    } catch (error) {
      const field = ((error as ApiError).data as { field?: string } | undefined)?.field;
      this.profileMessage.set({ ok: false, text: field === 'pickupPincode' ? this.t('Enter a valid 6-digit pincode.', 'सही 6 अंकों का pincode लिखें।') : this.t('Could not save. Please try again.', 'Save नहीं हुआ। फिर से try करें।') });
    } finally {
      this.profileSaving.set(false);
    }
  }
}
