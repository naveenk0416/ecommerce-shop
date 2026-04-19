import { ChangeDetectionStrategy, Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-gst-calculator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule
  ],
  template: `
    <div class="max-w-4xl mx-auto py-12 px-6 space-y-20 animate-in fade-in slide-in-from-bottom-4">
      
      <!-- Hero Header -->
      <div class="text-center space-y-4">
        <h1 class="text-4xl md:text-5xl font-black text-slate-900 tracking-tight uppercase">Free GST Calculator</h1>
        <p class="text-slate-500 max-w-2xl mx-auto font-medium">
          SellAssist introduces a free GST calculator made just for small businesses! With this tool, you'll be able to calculate GST in minutes without any complex math.
        </p>
      </div>

      <!-- Calculator Card (Zoho/Modern Inspired) -->
      <div class="bg-white rounded-[3rem] shadow-2xl shadow-orange-500/10 border border-orange-50 overflow-hidden">
        <div class="p-8 md:p-12 space-y-12">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <!-- Amount -->
            <div class="space-y-3">
              <label for="gst-amount-main" class="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Amount</label>
              <input type="number" 
                     id="gst-amount-main"
                     [(ngModel)]="amount" 
                     class="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                     placeholder="0.00">
            </div>

            <!-- GST % -->
            <div class="space-y-3">
              <label for="gst-pct-select" class="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">GST %</label>
              <select id="gst-pct-select"
                      (change)="gstRate.set($any($event).target.value)"
                      class="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all appearance-none cursor-pointer">
                <option value="0">0%</option>
                <option value="5" selected>5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </select>
            </div>

            <!-- Tax Type -->
            <div class="space-y-3">
              <label for="tax-type-select" class="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Tax</label>
              <select id="tax-type-select"
                      (change)="calcType.set($any($event).target.value)"
                      class="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all appearance-none cursor-pointer">
                <option value="exclusive">Exclusive</option>
                <option value="inclusive">Inclusive</option>
              </select>
            </div>
          </div>

          <!-- Visual Equation -->
          <div class="grid grid-cols-5 items-center text-center">
            <div class="space-y-1">
              <div class="text-3xl font-black text-slate-900">₹{{results().base.toFixed(0)}}</div>
              <div class="text-[10px] font-bold uppercase tracking-widest text-blue-500">Actual Amount</div>
            </div>
            <div class="text-2xl font-light text-slate-300">+</div>
            <div class="space-y-1">
              <div class="text-3xl font-black text-emerald-600">₹{{results().gst.toFixed(0)}}</div>
              <div class="text-[10px] font-bold uppercase tracking-widest text-emerald-500">GST Amount</div>
            </div>
            <div class="text-2xl font-light text-slate-300">=</div>
            <div class="space-y-1">
              <div class="text-4xl font-black text-slate-900">₹{{results().total.toFixed(0)}}</div>
              <div class="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Total Amount</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Information Sections -->
      <div class="grid grid-cols-1 gap-16 px-4">
        <!-- Definition -->
        <article class="space-y-4">
          <h2 class="text-2xl font-black text-slate-900 tracking-tight">GST - Goods and Services Tax</h2>
          <p class="text-slate-600 leading-relaxed font-medium">
            GST or the Goods and Services Tax is an indirect tax that came into effect in India on the 1st of July, 2017. GST is levied on goods and services and has replaced other indirect taxes that were in effect before it came into use.
          </p>
        </article>

        <!-- How to Calculate -->
        <section class="bg-indigo-50/50 rounded-[3rem] p-12 border border-indigo-50/50">
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
            <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <h3 class="font-black text-blue-600 mb-3 uppercase tracking-widest text-xs">CGST</h3>
              <p class="text-slate-500 text-sm leading-relaxed font-medium">
                <b>Central Goods and Services Tax</b>, or CGST is collected by the central government for intra-state supply of goods and services and is governed by the CGST act.
              </p>
            </div>

            <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <h3 class="font-black text-indigo-600 mb-3 uppercase tracking-widest text-xs">SGST</h3>
              <p class="text-slate-500 text-sm leading-relaxed font-medium">
                <b>State Goods and Services Tax</b>, or SGST is collected by the state government for intra-state supply of goods and services and is governed by the SGST act.
              </p>
            </div>

            <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <h3 class="font-black text-indigo-600 mb-3 uppercase tracking-widest text-xs">IGST</h3>
              <p class="text-slate-500 text-sm leading-relaxed font-medium">
                <b>Integrated Goods and Services Tax</b>, or IGST is collected by the central government on inter-state supply of goods and services as well as imports.
              </p>
            </div>

            <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
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
            GST was implemented primarily to bring uniformity to tax collection. Under the GST regime, tax is collected cumulatively at the final stage of the production of goods or services. As per the GST 2.0 updates, there are four GST slabs—0%, 5%, 18%, and 40% with different goods and services taxed at different rates.
          </p>
        </article>
      </div>
    </div>
  `
})
export class GstCalculator {
  amount = signal<number>(0);
  gstRate = signal<number>(18);
  customRate: number | null = null;
  calcType = signal<'inclusive' | 'exclusive'>('exclusive');

  results = computed(() => {
    const amt = Number(this.amount() || 0);
    const rate = Number(this.gstRate() || 0);
    
    if (this.calcType() === 'exclusive') {
      const gstAmt = (amt * rate) / 100;
      return {
        base: amt,
        gst: gstAmt,
        total: amt + gstAmt
      };
    } else {
      const baseAmt = amt / (1 + (rate / 100));
      const gstAmt = amt - baseAmt;
      return {
        base: baseAmt,
        gst: gstAmt,
        total: amt
      };
    }
  });
}
