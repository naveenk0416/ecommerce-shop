/**
 * Loads Razorpay's checkout.js on demand — only when a payment is actually started — instead of
 * globally from index.html, so public pages don't pull in Razorpay's scripts (checkout.js itself
 * brings in its risk-detection bundle when loaded).
 */
import { PAYMENTS_ENABLED } from '../config/site-config';

type RazorpayConstructor = new (options: unknown) => { open: () => void; on: (event: string, cb: (response: unknown) => void) => void };

let loading: Promise<RazorpayConstructor> | null = null;

export function loadRazorpay(): Promise<RazorpayConstructor> {
  // Payments off: never touch checkout.razorpay.com (or its risk script).
  if (!PAYMENTS_ENABLED) return Promise.reject(new Error('Payments are not enabled'));
  const existing = (window as Window & { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);

  loading ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      const loaded = (window as Window & { Razorpay?: RazorpayConstructor }).Razorpay;
      if (loaded) resolve(loaded);
      else reject(new Error('Razorpay is not available.'));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('Unable to load Razorpay checkout script.'));
    };
    document.body.appendChild(script);
  });
  return loading;
}
