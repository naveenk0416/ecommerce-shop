import { ChangeDetectionStrategy, Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonLabel, IonSegment, IonSegmentButton } from '@ionic/angular/standalone';
import { close, calculator, informationCircle } from 'ionicons/icons';
import { addIcons } from 'ionicons';

@Component({
  selector: 'app-gst-calculator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule,
    IonIcon, IonLabel, IonSegment, IonSegmentButton
  ],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
            <ion-icon name="calculator" class="text-2xl"></ion-icon>
          </div>
          <div>
            <h2 class="text-xl font-bold text-slate-800">GST Calculator</h2>
            <p class="text-xs text-slate-500 font-medium uppercase tracking-wider">Quick tax calculation for sellers</p>
          </div>
        </div>
      </div>

      <div class="space-y-6">
        <!-- Calculation Type -->
        <ion-segment [(ngModel)]="calcType" class="bg-slate-100 rounded-xl p-1">
          <ion-segment-button value="exclusive" class="rounded-lg">
            <ion-label class="text-xs font-bold">Exclusive</ion-label>
          </ion-segment-button>
          <ion-segment-button value="inclusive" class="rounded-lg">
            <ion-label class="text-xs font-bold">Inclusive</ion-label>
          </ion-segment-button>
        </ion-segment>

        <!-- Amount Input -->
        <div class="space-y-2">
          <label for="gst-amount" class="text-xs font-bold uppercase tracking-widest text-slate-400">Amount (₹)</label>
          <div class="relative">
            <input type="number" 
                   id="gst-amount"
                   [(ngModel)]="amount" 
                   class="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-lg font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                   placeholder="0.00">
          </div>
        </div>

        <!-- GST Rate -->
        <div class="space-y-2">
          <label for="gst-custom-rate" class="text-xs font-bold uppercase tracking-widest text-slate-400">GST Rate (%)</label>
          <div class="grid grid-cols-4 gap-2">
            @for (rate of [5, 12, 18, 28]; track rate) {
              <button (click)="gstRate.set(rate)" 
                      [class]="gstRate() === rate ? 'bg-orange-500 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
                      class="py-3 rounded-xl text-sm font-bold transition-all">
                {{rate}}%
              </button>
            }
          </div>
          <input type="number" 
                 id="gst-custom-rate"
                 [(ngModel)]="customRate" 
                 (input)="gstRate.set(customRate || 0)"
                 class="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 mt-2"
                 placeholder="Custom Rate %">
        </div>

        <!-- Results Card -->
        <div class="bg-slate-900 rounded-2xl p-6 text-white shadow-xl space-y-4">
          <div class="flex justify-between items-center text-slate-400">
            <span class="text-xs font-bold uppercase tracking-widest">Base Amount</span>
            <span class="font-mono">₹{{results().base.toFixed(2)}}</span>
          </div>
          <div class="flex justify-between items-center text-slate-400">
            <span class="text-xs font-bold uppercase tracking-widest">GST ({{gstRate()}}%)</span>
            <span class="font-mono">₹{{results().gst.toFixed(2)}}</span>
          </div>
          <div class="h-px bg-slate-800"></div>
          <div class="flex justify-between items-center">
            <span class="text-sm font-black uppercase tracking-widest text-orange-400">Total Amount</span>
            <span class="text-2xl font-black font-mono tracking-tight">₹{{results().total.toFixed(2)}}</span>
          </div>
        </div>

        <div class="bg-orange-50 rounded-xl p-4 flex gap-3">
          <ion-icon name="information-circle" class="text-orange-500 text-xl flex-shrink-0"></ion-icon>
          <p class="text-xs text-orange-800 leading-relaxed">
            @if (calcType() === 'exclusive') {
              <b>GST Exclusive:</b> GST is added on top of your amount. Use this when you have the Net price and want to find the final selling price.
            } @else {
              <b>GST Inclusive:</b> GST is already part of your amount. Use this to find out how much actual revenue you keep after tax.
            }
          </p>
        </div>
      </div>
    </div>
  `
})
export class GstCalculator {
  amount = signal<number>(0);
  gstRate = signal<number>(18);
  customRate: number | null = null;
  calcType = signal<'inclusive' | 'exclusive'>('exclusive');

  constructor() {
    addIcons({ close, calculator, informationCircle });
  }

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
