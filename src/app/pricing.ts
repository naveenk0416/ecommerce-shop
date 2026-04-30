import { ChangeDetectionStrategy, Component, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonBadge } from '@ionic/angular/standalone';
import { AuthService } from './services/auth';
import { addIcons } from 'ionicons';
import { checkmarkCircle, sparkles, rocket, flash, star, close } from 'ionicons/icons';

@Component({
  selector: 'app-pricing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonBadge],
  template: `
    <div class="pricing-container p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      <button (click)="dismiss.emit()" class="absolute top-6 right-6 w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm border border-slate-100 text-slate-400 hover:text-slate-900 transition-colors z-20" aria-label="Close" title="Close">
        <ion-icon name="close" class="text-xl"></ion-icon>
      </button>

      <div class="text-center mb-12 mt-8">
        <h2 class="text-3xl font-black text-slate-900 tracking-tight mb-4">Choose Your Plan</h2>
        <p class="text-slate-500 font-medium max-w-md mx-auto">Scale your business with professional tools designed for Bharat's sellers.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        <!-- Free Plan -->
        <ion-card class="pricing-card m-0 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col hover:shadow-lg transition-all duration-300">
          <ion-card-header class="p-8">
            <div class="flex justify-between items-start mb-6">
              <div class="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-500">
                <ion-icon name="flash" class="text-2xl"></ion-icon>
              </div>
              @if (auth.profile()?.role === 'FREE') {
                <ion-badge color="medium" class="text-[9px] uppercase tracking-widest px-2 py-1">Current Plan</ion-badge>
              }
            </div>
            <ion-card-title class="text-2xl font-black text-slate-900 mb-2">Free</ion-card-title>
            <div class="flex items-baseline">
              <span class="text-4xl font-black text-slate-900">₹0</span>
              <span class="text-slate-400 text-sm font-bold ml-2 uppercase tracking-widest">/ Lifetime</span>
            </div>
          </ion-card-header>
          <ion-card-content class="px-8 pb-8 flex-grow">
            <ul class="space-y-4 mb-8">
              @for (feature of freeFeatures; track feature) {
                <li class="flex items-center gap-3">
                  <ion-icon name="checkmark-circle" class="text-slate-300 text-lg"></ion-icon>
                  <span class="text-sm font-medium text-slate-600">{{ feature }}</span>
                </li>
              }
            </ul>
            <button class="btn-secondary w-full" [disabled]="auth.profile()?.role === 'FREE'">
              {{ auth.profile()?.role === 'FREE' ? 'Current Plan' : 'Select Free' }}
            </button>
          </ion-card-content>
        </ion-card>

        <!-- Pro Plan -->
        <ion-card class="pricing-card m-0 rounded-[2.5rem] border-2 border-orange-500 shadow-xl flex flex-col relative overflow-visible transform scale-105 z-10 transition-all">
          <div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg">
            Recommended
          </div>
          <ion-card-header class="p-8">
            <div class="flex justify-between items-start mb-6">
              <div class="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-500">
                <ion-icon name="rocket" class="text-2xl"></ion-icon>
              </div>
              @if (auth.profile()?.role === 'PAID_PRO') {
                <ion-badge color="warning" class="text-[9px] uppercase tracking-widest px-2 py-1">Current Plan</ion-badge>
              }
            </div>
            <ion-card-title class="text-2xl font-black text-slate-900 mb-2">PAID_PRO</ion-card-title>
            <div class="flex items-baseline">
              <span class="text-4xl font-black text-slate-900">₹299</span>
              <span class="text-slate-400 text-sm font-bold ml-2 uppercase tracking-widest">/ Month</span>
            </div>
          </ion-card-header>
          <ion-card-content class="px-8 pb-8 flex-grow">
            <ul class="space-y-4 mb-8">
              @for (feature of proFeatures; track feature) {
                <li class="flex items-center gap-3">
                  <ion-icon name="checkmark-circle" class="text-orange-500 text-lg"></ion-icon>
                  <span class="text-sm font-medium text-slate-700">{{ feature }}</span>
                </li>
              }
            </ul>
            <button class="btn-orange-premium w-full" (click)="subscribe()">
              {{ auth.profile()?.role === 'PAID_PRO' ? 'Renew Subscription' : 'Upgrade Now' }}
              <ion-icon name="sparkles" class="ml-2"></ion-icon>
            </button>
          </ion-card-content>
        </ion-card>
      </div>

      <div class="mt-16 text-center">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Secure Payment with Razorpay & UPI</p>
        <div class="flex justify-center gap-6 opacity-20 filter grayscale">
           <img src="https://upload.wikimedia.org/wikipedia/commons/e/e1/UPI-Logo-vector.svg" alt="UPI" class="h-6">
           <img src="https://upload.wikimedia.org/wikipedia/commons/8/89/Razorpay_logo.svg" alt="Razorpay" class="h-4">
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      background-color: #f8fafc;
      min-height: 100vh;
    }
    .pricing-card {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
  `]
})
export class Pricing {
  public auth = inject(AuthService);
  dismiss = output();

  freeFeatures = [
    '5 Total Response Limit',
    'Basic AI Listing Generation',
    'Community Support',
    'Single Platform View'
  ];

  proFeatures = [
    '50 Listings per Day',
    'Automated HSN + GST Codes',
    'Save Full History Forever',
    'Access to Inventory Tools',
    'Priority AI Processing',
    'Multi-Platform Templates'
  ];

  constructor() {
    addIcons({ checkmarkCircle, sparkles, rocket, flash, star, close });
  }

  async subscribe() {
    const user = this.auth.user();
    if (!user) {
      alert('Please sign in to upgrade');
      return;
    }

    if (typeof Razorpay === 'undefined') {
      alert('Payment system is loading. Please try again in a few seconds.');
      return;
    }

    const options = {
      key: (typeof RAZORPAY_KEY_ID !== 'undefined' && RAZORPAY_KEY_ID) ? RAZORPAY_KEY_ID : '', 
      amount: "29900", // Amount in paise
      currency: "INR",
      name: "SellAssist",
      description: "PAID_PRO Subscription",
      image: "https://api.dicebear.com/7.x/avataaars/svg?seed=SellAssist",
      handler: async (response: { razorpay_payment_id: string }) => {
        if (response.razorpay_payment_id) {
          try {
            await this.auth.updateProfile({ role: 'PAID_PRO' });
            alert('Payment Successful! Welcome to PAID_PRO.');
            this.dismiss.emit();
          } catch (e) {
            console.error('Profile update failed after payment', e);
            alert('Payment received but profile update failed. Please contact support.');
          }
        }
      },
      prefill: {
        name: user.displayName || "",
        email: user.email || "",
      },
      theme: {
        color: "#f97316" // Orange 500
      }
    };

    if (!options.key) {
      alert('Razorpay Key ID is not configured. Please add RAZORPAY_KEY_ID to the application secrets.');
      return;
    }

    try {
      const rzp = new Razorpay(options);
      rzp.open();
    } catch (e) {
      console.error('Razorpay initialization failed', e);
      alert('Payment initialization failed. Please try again.');
    }
  }
}
