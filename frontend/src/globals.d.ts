declare const APP_URL: string;
declare const Razorpay: new (options: unknown) => {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
};
