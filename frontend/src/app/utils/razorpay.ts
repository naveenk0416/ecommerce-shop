/**
 * Loads Razorpay's checkout.js on demand — only when a payment is actually started — instead of
 * globally from index.html, so public pages don't pull in Razorpay's scripts (checkout.js itself
 * brings in its risk-detection bundle when loaded).
 */
type RazorpayConstructor = new (options: unknown) => { open: () => void; on: (event: string, cb: (response: unknown) => void) => void };

let loading: Promise<RazorpayConstructor> | null = null;

export function loadRazorpay(): Promise<RazorpayConstructor> {
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
