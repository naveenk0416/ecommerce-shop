import { ChangeDetectionStrategy, Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronDown, swapVertical } from 'ionicons/icons';
import { GST_EFFECTIVE_DATE, GST_SLABS } from './config/gst-rates';

@Component({
  selector: 'app-gst-calculator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, IonIcon
  ],
  template: `
  <div class="max-w-4xl mx-auto py-12 md:py-20 px-0 sm:px-6 space-y-16 md:space-y-24 animate-in fade-in slide-in-from-bottom-4 duration-700">

      <!-- Hero Header -->
      <div class="text-center space-y-6">
        <div class="badge mx-auto">Free Tooling »</div>
        <h1 class="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter uppercase font-display italic leading-none">Bharat GST <br> <span class="text-orange">Calculator</span></h1>
        <p class="text-slate-500 max-w-xl mx-auto font-medium text-lg leading-relaxed">
          Zero math. Peak accuracy. Calculated for small businesses across Bharat.
        </p>
      </div>

      <!-- Calculator Card (Zoho/Modern Inspired) -->
      <div class="bg-white rounded-[2rem] md:rounded-[3.5rem] shadow-premium border border-slate-100 overflow-hidden group">
        <div class="p-5 sm:p-10 md:p-16 space-y-10 md:space-y-16">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <!-- Amount -->
            <div class="space-y-4">
              <label for="gst-amount-main" class="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400 ml-1">Valuation (INR)</label>
              <div class="relative">
                 <span class="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 font-bold">₹</span>
                 <input type="number"
                        id="gst-amount-main"
                        min="0"
                        [max]="maxAmount"
                        step="0.01"
                        inputmode="decimal"
                        [value]="amountText()"
                        (input)="amountText.set($any($event.target).value); amountBadInput.set(!!$any($event.target).validity?.badInput)"
                        (blur)="amountTouched.set(true)"
                        [attr.aria-invalid]="!!amountError()"
                        [attr.aria-describedby]="amountError() ? 'gst-amount-error' : null"
                        [class.!border-red-400]="!!amountError()"
                        [class.!bg-red-50]="!!amountError()"
                        class="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-6 py-5 text-xl font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-950/5 focus:bg-white transition-all"
                        placeholder="0.00">
              </div>
              @if (amountError()) {
                <p id="gst-amount-error" role="alert" class="text-sm font-semibold text-red-600 ml-1">{{ amountError() }}</p>
              }
            </div>

            <!-- GST % -->
            <div class="space-y-4">
              <label for="gst-pct-select" class="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400 ml-1">GST Logic</label>
              <div class="relative">
                <select id="gst-pct-select"
                        (change)="gstRate.set(+$any($event).target.value)"
                        class="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-5 text-xl font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-950/5 focus:bg-white transition-all appearance-none cursor-pointer">
                  @for (slab of slabs; track slab.rate) {
                    <option [value]="slab.rate" [selected]="slab.rate === gstRate()">{{ slab.label }}</option>
                  }
                </select>
                <div class="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none">
                   <ion-icon name="chevron-down" class="text-slate-400"></ion-icon>
                </div>
              </div>
            </div>

            <!-- Tax Type -->
            <div class="space-y-4">
              <label for="tax-type-select" class="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400 ml-1">Computation</label>
              <div class="relative">
                <select id="tax-type-select"
                        (change)="calcType.set($any($event).target.value)"
                        class="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-5 text-xl font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-950/5 focus:bg-white transition-all appearance-none cursor-pointer">
                  <option value="exclusive">Exclusive (+Tax)</option>
                  <option value="inclusive">Inclusive (-Tax)</option>
                </select>
                <div class="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none">
                   <ion-icon name="swap-vertical" class="text-slate-400"></ion-icon>
                </div>
              </div>
            </div>
          </div>

          <!-- Supply type: intra-state splits GST into CGST + SGST, inter-state is IGST -->
          <fieldset class="space-y-4">
            <legend class="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400 ml-1 mb-4">Supply type</legend>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label class="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 cursor-pointer font-bold text-slate-800 min-h-[44px]">
                <input type="radio" name="gst-supply" value="intra" [checked]="supply() === 'intra'" (change)="supply.set('intra')">
                Intra-state (CGST + SGST)
              </label>
              <label class="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 cursor-pointer font-bold text-slate-800 min-h-[44px]">
                <input type="radio" name="gst-supply" value="inter" [checked]="supply() === 'inter'" (change)="supply.set('inter')">
                Inter-state (IGST)
              </label>
            </div>
          </fieldset>

          <!-- Visual Equation -->
          <div class="bg-slate-50 rounded-[2rem] md:rounded-[2.5rem] p-5 sm:p-10 grid grid-cols-1 md:grid-cols-5 items-center text-center gap-8 md:gap-4 relative overflow-hidden">
            <div class="absolute inset-0 bg-linear-to-r from-orange-500/5 to-transparent"></div>

            <div class="space-y-2 relative z-10">
              <div class="text-[11px] font-bold uppercase tracking-widest text-slate-400">Net Principal</div>
              <div class="text-3xl font-extrabold text-slate-900 tracking-tighter break-words" data-testid="gst-base">{{ inr(results().base) }}</div>
            </div>

            <div class="text-2xl font-light text-slate-200 hidden md:block">+</div>

            <div class="space-y-2 relative z-10">
              <div class="text-[11px] font-bold uppercase tracking-widest text-orange-500">GST Portion</div>
              <div class="text-3xl font-extrabold text-orange-600 tracking-tighter break-words" data-testid="gst-tax">{{ inr(results().gst) }}</div>
            </div>

            <div class="text-2xl font-light text-slate-200 hidden md:block">=</div>

            <div class="space-y-2 relative z-10">
              <div class="text-[11px] font-bold uppercase tracking-widest text-slate-900">Gross Total</div>
              <div class="text-4xl md:text-5xl font-extrabold text-slate-950 font-display tracking-tighter italic break-words" data-testid="gst-total">{{ inr(results().total) }}</div>
            </div>
          </div>

          <!-- Tax split + copy -->
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <dl class="grid grid-cols-2 md:flex gap-4 md:gap-10 text-slate-700" data-testid="gst-split">
              @if (supply() === 'intra') {
                <div><dt class="text-[11px] font-bold uppercase tracking-widest text-slate-400">CGST ({{ halfRate() }}%)</dt><dd class="text-xl font-extrabold">{{ inr(results().cgst) }}</dd></div>
                <div><dt class="text-[11px] font-bold uppercase tracking-widest text-slate-400">SGST ({{ halfRate() }}%)</dt><dd class="text-xl font-extrabold">{{ inr(results().sgst) }}</dd></div>
              } @else {
                <div><dt class="text-[11px] font-bold uppercase tracking-widest text-slate-400">IGST ({{ gstRate() }}%)</dt><dd class="text-xl font-extrabold">{{ inr(results().gst) }}</dd></div>
              }
            </dl>
            <button type="button"
                    (click)="copyResult()"
                    [disabled]="!!amountError() || amountText() === ''"
                    class="min-h-[44px] px-6 py-3 rounded-2xl bg-slate-900 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="gst-copy">
              {{ copied() ? 'Copied ✓' : 'Copy result' }}
            </button>
            <span class="sr-only" role="status">{{ copied() ? 'Result copied to clipboard' : '' }}</span>
          </div>
        </div>
      </div>

      <!-- Information Sections -->
      <div class="grid grid-cols-1 gap-12 md:gap-16 px-0 md:px-4">
        <!-- Definition -->
        <article class="space-y-4">
          <h2 class="text-2xl font-black text-slate-900 tracking-tight">GST - Goods and Services Tax</h2>
          <p class="text-slate-600 leading-relaxed font-medium">
            GST or the Goods and Services Tax is an indirect tax that came into effect in India on the 1st of July, 2017. GST is levied on goods and services and has replaced other indirect taxes that were in effect before it came into use.
          </p>
        </article>

        <!-- How to Calculate -->
        <section class="bg-indigo-50/50 rounded-[2rem] md:rounded-[3rem] p-5 sm:p-12 border border-indigo-50/50">
          <h2 class="text-2xl font-black text-slate-900 tracking-tight mb-8">How can you calculate GST with this tool?</h2>
          <p class="text-slate-600 font-medium mb-12">
            With the free GST calculator, you can calculate the tax amount in three simple steps. The tool provides you with three fields that have to be filled, and it calculates GST automatically based on what you fill in.
          </p>

          <div class="space-y-8 relative">
            <div class="absolute left-4 top-4 bottom-4 w-px border-l-2 border-dashed border-indigo-200"></div>

            <div class="relative pl-12">
              <div class="absolute left-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-black text-sm shadow-xl shadow-indigo-200">1</div>
              <p class="text-slate-700 font-bold">Enter the price of the goods or services in the Amount field.</p>
            </div>

            <div class="relative pl-12">
              <div class="absolute left-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-black text-sm shadow-xl shadow-indigo-200">2</div>
              <p class="text-slate-700 font-bold">Enter the percentage of GST, or the slab that the product comes under, in the GST % field.</p>
            </div>

            <div class="relative pl-12">
              <div class="absolute left-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-black text-sm shadow-xl shadow-indigo-200">3</div>
              <p class="text-slate-700 font-bold">Choose if the price that you entered is inclusive or exclusive of tax in the Tax field.</p>
            </div>

            <div class="relative pl-12 text-slate-500 text-sm font-medium pt-4">
              <div class="absolute left-3 w-2 h-2 bg-indigo-400 rounded-full"></div>
              If the price you've entered is inclusive of tax, the tool automatically calculates, and displays the original price of the goods or service after subtracting the GST.
            </div>

            <div class="relative pl-12 text-slate-500 text-sm font-medium">
              <div class="absolute left-3 w-2 h-2 bg-indigo-400 rounded-full"></div>
              If the price you've entered is exclusive of tax, the tool automatically calculates, and displays the gross price after adding the GST.
            </div>
          </div>
        </section>

        <!-- Types of GST -->
        <article class="space-y-8">
          <h2 class="text-2xl font-black text-slate-900 tracking-tight">There are four types of GST active in India. They are:</h2>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-white p-5 sm:p-8 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <h3 class="font-black text-blue-600 mb-3 uppercase tracking-widest text-xs">CGST</h3>
              <p class="text-slate-500 text-sm leading-relaxed font-medium">
                <b>Central Goods and Services Tax</b>, or CGST is collected by the central government for intra-state supply of goods and services and is governed by the CGST act.
              </p>
            </div>

            <div class="bg-white p-5 sm:p-8 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <h3 class="font-black text-indigo-600 mb-3 uppercase tracking-widest text-xs">SGST</h3>
              <p class="text-slate-500 text-sm leading-relaxed font-medium">
                <b>State Goods and Services Tax</b>, or SGST is collected by the state government for intra-state supply of goods and services and is governed by the SGST act.
              </p>
            </div>

            <div class="bg-white p-5 sm:p-8 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <h3 class="font-black text-indigo-600 mb-3 uppercase tracking-widest text-xs">IGST</h3>
              <p class="text-slate-500 text-sm leading-relaxed font-medium">
                <b>Integrated Goods and Services Tax</b>, or IGST is collected by the central government on inter-state supply of goods and services as well as imports.
              </p>
            </div>

            <div class="bg-white p-5 sm:p-8 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <h3 class="font-black text-slate-800 mb-3 uppercase tracking-widest text-xs">UTGST</h3>
              <p class="text-slate-500 text-sm leading-relaxed font-medium">
                <b>Union Territory Goods and Services Tax</b>, or UTGST is applicable on supply of goods or services that take place in any of the seven union territories in India.
              </p>
            </div>
          </div>
        </article>

        <!-- Final Note -->
        <article class="space-y-4 pt-8 border-t border-slate-100">
          <h2 class="text-2xl font-black text-slate-900 tracking-tight">More on GST</h2>
          <p class="text-slate-600 leading-relaxed font-medium">
            GST was implemented primarily to bring uniformity to tax collection. Under the GST regime, tax is collected cumulatively at the final stage of the production of goods or services. Under GST 2.0 (effective {{ effectiveDate }}; 12% and 28% were removed for almost all goods), there are four GST slabs—0%, 5%, 18%, and 40% with different goods and services taxed at different rates.
          </p>
        </article>
      </div>
    </div>
  `
})
export class GstCalculator {
  constructor() {
    addIcons({ chevronDown, swapVertical });
  }

  readonly slabs = GST_SLABS;
  readonly effectiveDate = GST_EFFECTIVE_DATE;

  /** ₹1,000 crore — far above any single invoice, low enough to stay exact in paise. */
  readonly maxAmount = MAX_AMOUNT;

  /** Raw text of the amount field ('' = empty). */
  amountText = signal('');
  amountTouched = signal(false);
  /** The browser holds text it can't parse as a number (e.g. "-" or "1e"); value() reads as ''. */
  amountBadInput = signal(false);
  gstRate = signal<number>(18);
  calcType = signal<'inclusive' | 'exclusive'>('exclusive');
  supply = signal<'intra' | 'inter'>('intra');
  copied = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  /** Valid amount in rupees, or null (empty / negative / too large / not a number). */
  private readonly amount = computed<number | null>(() => {
    const text = this.amountText().trim();
    if (!text) return null;
    const n = Number(text);
    return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT ? n : null;
  });

  amountError = computed<string | null>(() => {
    const text = this.amountText().trim();
    if (!text) return this.amountBadInput() ? 'Enter a valid amount, e.g. 1000 or 999.50.' : this.amountTouched() ? 'Enter an amount above ₹0.' : null;
    const n = Number(text);
    if (!Number.isFinite(n)) return 'Enter a valid amount, e.g. 1000 or 999.50.';
    if (n <= 0) return 'Enter an amount above ₹0.';
    if (n > MAX_AMOUNT) return `Amount is too large — enter up to ${this.inr(MAX_AMOUNT)}.`;
    return null;
  });

  halfRate = computed(() => this.gstRate() / 2);

  /** ₹1,39,99,99,999.00 — Indian digit grouping, always 2 decimals. */
  inr(value: number): string {
    return '₹' + INR.format(value);
  }

  async copyResult(): Promise<void> {
    const amount = this.amount();
    if (amount === null) {
      this.amountTouched.set(true);
      return;
    }
    const r = this.results();
    const type = this.calcType() === 'exclusive' ? 'exclusive of GST' : 'inclusive of GST';
    const split = this.supply() === 'intra'
      ? `CGST ${this.halfRate()}%: ${this.inr(r.cgst)}\nSGST ${this.halfRate()}%: ${this.inr(r.sgst)}`
      : `IGST ${this.gstRate()}%: ${this.inr(r.gst)}`;
    const text = `Amount: ${this.inr(amount)} (${type})\nNet amount: ${this.inr(r.base)}\nGST ${this.gstRate()}%: ${this.inr(r.gst)}\n${split}\nTotal: ${this.inr(r.total)}`;
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      window.prompt('Copy the result:', text);
    }
  }

  /** Everything in whole paise so ₹847.46 + ₹152.54 always adds up to ₹1,000.00. */
  results = computed(() => {
    const paise = Math.round((this.amount() ?? 0) * 100);
    const rate = Number(this.gstRate() || 0);
    let base: number;
    let gst: number;
    if (this.calcType() === 'exclusive') {
      base = paise;
      gst = Math.round((paise * rate) / 100);
    } else {
      base = Math.round((paise * 100) / (100 + rate));
      gst = paise - base;
    }
    const cgst = Math.round(gst / 2);
    return { base: base / 100, gst: gst / 100, total: (base + gst) / 100, cgst: cgst / 100, sgst: (gst - cgst) / 100 };
  });
}

const MAX_AMOUNT = 10_000_000_000;
const INR = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
