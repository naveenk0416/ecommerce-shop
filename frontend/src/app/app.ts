import { ChangeDetectionStrategy, Component, signal, inject, PLATFORM_ID, effect, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Title, Meta } from '@angular/platform-browser';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { IonApp, IonHeader, IonToolbar, IonContent,
  IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle,
  IonLabel, IonSpinner,
  IonInput, IonTextarea,
  ToastController, AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { camera, cloudUpload, sparkles, image, list, pricetag, copy, checkmark, logIn, logOut, logOutOutline, personCircle, pencil, save, arrowForward, arrowBack, flash, rocket, shieldCheckmark, close, cube, settings, chevronUpOutline, chevronDownOutline, logoFacebook, logoInstagram, logoTwitter, shareSocial, shieldCheckmarkOutline, calculator, informationCircle, lockClosed, mailOutline, fingerPrintOutline, calendarOutline, ellipsisHorizontal, chevronForwardOutline, refresh, star, eye, eyeOff, trash, colorPalette, time, add, albumsOutline, search, logoAmazon, storefront, linkOutline, unlink, heart, trendingUp } from 'ionicons/icons';
import { GeminiService, ProductDetails } from './services/gemini';
import { AuthService } from './services/auth';
import { ListingService, Listing } from './services/listing';
import { TemplateService } from './services/template';
import { MarketplaceConnectionsService, MarketplaceConnectionsResponse } from './services/marketplace-connections';
import { Landing } from './landing';
import { Products } from './products';
import { AdminComponent } from './admin';
import { GstCalculator } from './gst-calculator';
import { ImageEditor } from './image-editor';
import { resizeImage } from './utils/image';
import { parsePrice } from './utils/price';
import { apiFetch } from './services/api';
import { PasswordField } from './ui/password-field/password-field';
import { PasswordStrength } from './ui/password-strength/password-strength';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, FormsModule, Landing, Products, AdminComponent, GstCalculator, ImageEditor, RouterOutlet,
    IonApp, IonHeader, IonToolbar, IonContent,
    IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle,
    IonLabel, IonSpinner,
    IonInput, IonTextarea,
    PasswordField, PasswordStrength
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private gemini = inject(GeminiService);
  public auth = inject(AuthService);
  private listingService = inject(ListingService);
  public templateService = inject(TemplateService);
  private marketplaceConnections = inject(MarketplaceConnectionsService);
  private platformId = inject(PLATFORM_ID);
  private toastController = inject(ToastController, { optional: true });
  private alertController = inject(AlertController, { optional: true });
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private router = inject(Router);

  showLanding = signal(true);
  selectedImage = signal<string | null>(null);
  processedImage = signal<string | null>(null);
  isEditingImage = signal(false);
  isProcessing = signal(false);
  isGeneratingImage = signal(false);
  isDragging = signal(false);
  processingStage = signal<string>('idle'); // idle, resizing, uploading, analyzing, background
  isSaving = signal(false);
  productDetails = signal<ProductDetails | null>(null);
  activeTab = signal<string>('details');
  mainView = signal<'home' | 'listings' | 'products' | 'settings' | 'admin' | 'gst' | 'workspace'>('home');
  currentPath = signal<string>('');
  myListings = signal<Listing[]>([]);
  copiedField = signal<string | null>(null);
  editingField = signal<string | null>(null);
  today = signal<string>(new Date().toISOString().split('T')[0]);
  
  // Feedback State
  ratingStars = [1, 2, 3, 4, 5];
  showFeedbackModal = signal(false);
  currentFeedbackRating = signal(0);
  currentFeedbackComment = signal('');
  pendingListingId = signal<string | null>(null);

  // Auth Form State
  email = signal('');
  password = signal('');
  confirmPassword = signal('');
  rememberMe = signal(true);

  // Additional Registration Fields
  regName = signal('');
  regPhone = signal('');
  regGST = signal('');

  // Real-time validation — only shown once a field has been touched, so errors don't appear
  // before the user has had a chance to type anything.
  emailTouched = signal(false);
  passwordTouched = signal(false);
  nameTouched = signal(false);
  phoneTouched = signal(false);
  confirmPasswordTouched = signal(false);

  emailError = computed(() => {
    const value = this.email().trim();
    if (!value) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.';
    return '';
  });

  nameError = computed(() => (this.regName().trim().length < 2 ? 'Enter your full name.' : ''));

  /** Mobile number is optional (matches the backend), but its format is validated when provided. */
  phoneError = computed(() => {
    const digits = this.regPhone().replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length !== 10) return 'Mobile number must be exactly 10 digits.';
    return '';
  });

  /** Kept in sync with the backend's STRONG_PASSWORD_RE in auth.ts. */
  passwordValid = computed(() => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(this.password()));

  confirmPasswordError = computed(() => {
    if (!this.confirmPassword()) return '';
    return this.confirmPassword() !== this.password() ? 'Passwords do not match.' : '';
  });

  /** Gates the register button — every rule must pass before submission is allowed. */
  registrationValid = computed(
    () =>
      !this.emailError() &&
      !this.nameError() &&
      !this.phoneError() &&
      this.passwordValid() &&
      this.confirmPassword() === this.password() &&
      !!this.confirmPassword(),
  );

  loginValid = computed(() => !this.emailError() && this.password().length > 0);

  isRegistering = signal(false);
  authError = signal<string | null>(null);
  checkoutMessage = signal<string | null>(null);
  isProcessingCheckout = signal(false);

  // Forgot/Reset Password State
  passwordResetMode = signal<'none' | 'forgot' | 'reset'>('none');
  resetToken = signal<string | null>(null);
  forgotEmailSent = signal(false);
  newPassword = signal('');
  confirmNewPassword = signal('');
  resetPasswordSuccess = signal(false);

  // Email Verification State
  /** Non-null while showing the "check your inbox" screen after registration. */
  verificationPendingEmail = signal<string | null>(null);
  /** Shown on a login attempt that failed specifically because the account isn't verified yet. */
  showResendVerification = signal(false);
  isResendingVerification = signal(false);
  resendVerificationSent = signal(false);
  /** Set when the URL is /verify-email?token=... — drives the auto-verify screen. */
  emailVerificationState = signal<'none' | 'verifying' | 'success' | 'error'>('none');
  emailVerificationError = signal<string | null>(null);

  // Marketplace Connections (Settings)
  marketplaceConnectionsData = signal<MarketplaceConnectionsResponse | null>(null);
  loadingMarketplaceConnections = signal(false);
  connectingAmazon = signal(false);
  disconnectingMarketplace = signal<'amazon' | 'flipkart' | null>(null);
  marketplaceConnectionMessage = signal<string | null>(null);
  /** Set when we've landed here via Amazon's own "Manage" link (the Amazon-initiated OAuth entry
   * point) and the seller isn't logged in yet — resumed automatically once they are. */
  pendingAmazonLogin = signal<{ callbackUri: string; state: string } | null>(null);
  resumingAmazonLogin = signal(false);

  private async ensureRazorpayScript() {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('Checkout is only available in the browser.');
    }

    if ((window as Window & { Razorpay?: new (options: unknown) => { open: () => void } }).Razorpay) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;

    await new Promise<void>((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load Razorpay checkout script.'));
      document.body.appendChild(script);
    });
  }

  async startRazorpayCheckout() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.isProcessingCheckout.set(true);
    this.checkoutMessage.set(null);

    try {
      await this.ensureRazorpayScript();

      const { key_id } = await apiFetch<{ key_id: string }>('/razorpay-config');

      const order = await apiFetch<{ order_id: string; amount: number; currency: string }>('/create-order', {
        method: 'POST',
        body: { amount: 49900, currency: 'INR', receipt: 'sellassist-demo' },
      });

      const options = {
        key: key_id,
        amount: order.amount,
        currency: order.currency,
        name: 'SellAssist',
        description: 'Demo Checkout',
        order_id: order.order_id,
        handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          void (async () => {
            try {
              await apiFetch('/verify-payment', { method: 'POST', body: response });
              this.checkoutMessage.set('Payment verified successfully.');
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Payment verification failed.';
              this.checkoutMessage.set(message);
            }
          })();
        },
        modal: {
          ondismiss: () => {
            this.checkoutMessage.set('Payment was cancelled.');
          },
        },
        failed: () => {
          this.checkoutMessage.set('Payment failed. Please try again.');
        },
        prefill: {
          name: this.auth.user()?.displayName || 'SellAssist Customer',
          email: this.auth.user()?.email || 'demo@sellassist.ai',
        },
        theme: {
          color: '#f97316',
        },
      };

      const RazorpayConstructor = (window as Window & { Razorpay?: new (options: unknown) => { open: () => void } }).Razorpay;
      if (!RazorpayConstructor) {
        throw new Error('Razorpay is not available.');
      }
      const razorpay = new RazorpayConstructor(options);
      razorpay.open();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to complete checkout.';
      this.checkoutMessage.set(message);
    } finally {
      this.isProcessingCheckout.set(false);
    }
  }

  private syncViewWithUrl(path: string) {
    this.currentPath.set(path);
    if (path === '/' || path === '/home') {
      this.showLanding.set(true);
    } else {
      this.showLanding.set(false);
      if (path === '/listings') this.mainView.set('listings');
      else if (path === '/inventory') this.mainView.set('products');
      else if (path === '/gst-calculator') this.mainView.set('gst');
      else if (path === '/admin') this.mainView.set('admin');
      else if (path === '/settings') { this.mainView.set('settings'); this.loadMarketplaceConnections(); }
      else if (path.startsWith('/optimize')) this.mainView.set('workspace');
      else if (path.startsWith('/workspace/')) this.mainView.set('workspace');
    }
  }

  async sendPasswordResetEmail() {
    this.authError.set(null);
    const emailVal = this.email().trim();
    if (!emailVal) {
      this.authError.set('Please enter your email address.');
      return;
    }
    this.isProcessing.set(true);
    try {
      await this.auth.forgotPassword(emailVal);
      this.forgotEmailSent.set(true);
    } catch (error) {
      this.authError.set((error instanceof Error && error.message) || 'Failed to send reset email. Please try again.');
    } finally {
      this.isProcessing.set(false);
    }
  }

  async submitPasswordReset() {
    this.authError.set(null);
    const token = this.resetToken();
    if (!token) {
      this.authError.set('Invalid or missing reset token.');
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(this.newPassword())) {
      this.authError.set('Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.');
      return;
    }
    if (this.newPassword() !== this.confirmNewPassword()) {
      this.authError.set('Passwords do not match.');
      return;
    }
    this.isProcessing.set(true);
    try {
      await this.auth.resetPassword(token, this.newPassword());
      this.resetPasswordSuccess.set(true);
    } catch (error) {
      this.authError.set((error instanceof Error && error.message) || 'Failed to reset password. The link may have expired.');
    } finally {
      this.isProcessing.set(false);
    }
  }

  backToLogin() {
    this.passwordResetMode.set('none');
    this.forgotEmailSent.set(false);
    this.resetPasswordSuccess.set(false);
    this.resetToken.set(null);
    this.authError.set(null);
    this.email.set('');
    this.newPassword.set('');
    this.confirmNewPassword.set('');
    this.navigateTo('landing');
  }

  navigateTo(view: 'home' | 'listings' | 'products' | 'gst' | 'admin' | 'settings' | 'landing') {
    if (view === 'landing') {
      this.showLanding.set(true);
      this.router.navigate(['/home']);
    } else {
      this.showLanding.set(false);
      this.mainView.set(view);
      const path = view === 'products' ? 'inventory' : (view === 'gst' ? 'gst-calculator' : (view === 'home' ? 'optimize' : view));
      this.router.navigate(['/' + path]);
      if (view === 'settings') {
        this.loadMarketplaceConnections();
      }
    }
  }

  constructor() {
    addIcons({calculator,shieldCheckmark,logOut,close,personCircle,arrowBack,arrowForward,sparkles,cloudUpload,colorPalette,image,pencil,save,time,add,albumsOutline,search,logoAmazon,storefront,linkOutline,unlink,flash,heart,eye,eyeOff,trash,trendingUp,logoFacebook,logoInstagram,logoTwitter,list,camera,pricetag,copy,checkmark,logIn,logOutOutline,rocket,shieldCheckmarkOutline,cube,settings,chevronUpOutline,chevronDownOutline,shareSocial,informationCircle,lockClosed,mailOutline,fingerPrintOutline,calendarOutline,ellipsisHorizontal,chevronForwardOutline,refresh,star});
    
    // Subscribe to route changes
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.syncViewWithUrl(event.urlAfterRedirects);
    });

    if (isPlatformBrowser(this.platformId)) {
      // URL Sync Logic
      this.syncViewWithUrl(window.location.pathname);

      // Forgot/Reset Password Link Handling
      if (window.location.pathname === '/reset-password') {
        const token = new URLSearchParams(window.location.search).get('token');
        if (token) {
          this.resetToken.set(token);
          this.passwordResetMode.set('reset');
          this.showLanding.set(false);
        }
      } else if (window.location.pathname === '/forgot-password') {
        this.passwordResetMode.set('forgot');
        this.showLanding.set(false);
      } else if (window.location.pathname === '/verify-email') {
        const token = new URLSearchParams(window.location.search).get('token');
        this.showLanding.set(false);
        if (token) {
          this.verifyEmailFromLink(token);
        } else {
          this.emailVerificationState.set('error');
          this.emailVerificationError.set('Missing verification token.');
        }
      } else if (window.location.pathname === '/settings') {
        // Landing back here after the Amazon OAuth redirect round-trip.
        const params = new URLSearchParams(window.location.search);
        const amazonResult = params.get('amazon');
        if (amazonResult === 'connected') {
          this.marketplaceConnectionMessage.set('Amazon connected successfully.');
        } else if (amazonResult === 'error') {
          this.marketplaceConnectionMessage.set(params.get('message') || 'Failed to connect Amazon. Please try again.');
        }
        if (amazonResult) {
          window.history.replaceState({}, '', '/settings');
        }
      }

      // Amazon-initiated OAuth entry point (seller clicked "Manage" from Seller Central) —
      // independent of the path-specific branches above since /amazon/login redirects here to
      // the site root. Resumed once the seller is confirmed logged in (effect below).
      const amazonLoginParams = new URLSearchParams(window.location.search);
      if (amazonLoginParams.get('amazonLogin') === '1') {
        const callbackUri = amazonLoginParams.get('amazon_callback_uri');
        const state = amazonLoginParams.get('amazon_state');
        if (callbackUri && state) {
          this.pendingAmazonLogin.set({ callbackUri, state });
        }
        window.history.replaceState({}, '', window.location.pathname);
      }

      // Resumes the Amazon-initiated flow the moment the seller is authenticated — whether they
      // were already logged in when they landed here, or just completed login/registration.
      effect(() => {
        const pending = this.pendingAmazonLogin();
        const user = this.auth.user();
        if (!pending || !user || this.resumingAmazonLogin()) return;

        this.resumingAmazonLogin.set(true);
        this.marketplaceConnections
          .resumeAmazonLogin(pending.callbackUri, pending.state)
          .then((redirectUrl) => {
            window.location.href = redirectUrl;
          })
          .catch((error) => {
            console.error('Failed to resume Amazon login', error);
            this.marketplaceConnectionMessage.set('Failed to resume Amazon authorization. Please try connecting from Settings instead.');
            this.pendingAmazonLogin.set(null);
            this.resumingAmazonLogin.set(false);
            this.navigateTo('settings');
          });
      });

      // SEO Effect
      effect(() => {
        const view = this.mainView();
        const landing = this.showLanding();
        let title = 'SellAssist - AI-Powered Selling Partner';
        let description = 'Empowering Indian sellers with AI-driven product optimization and inventory management.';

        if (landing) {
          title = 'SellAssist - Bharat\'s AI Growth Partner';
        } else {
          switch (view) {
            case 'home':
              title = 'Optimize Product Listings - SellAssist';
              description = 'Use AI to generate professional titles, descriptions, and tags for your marketplace listings.';
              break;
            case 'listings':
              title = 'My Asset History - SellAssist';
              description = 'View and manage your previously optimized marketplace listings.';
              break;
            case 'products':
              title = 'Inventory Management - SellAssist';
              description = 'Keep track of your products, stock levels, and valuations in one place.';
              break;
            case 'gst':
              title = 'GST Calculator - SellAssist';
              description = 'Quickly calculate GST and profit margins for your products.';
              break;
            case 'admin':
              title = 'Admin Panel - SellAssist';
              break;
          }
        }

        this.titleService.setTitle(title);
        this.metaService.updateTag({ name: 'description', content: description });
        this.metaService.updateTag({ property: 'og:title', content: title });
        this.metaService.updateTag({ property: 'og:description', content: description });
      });

      // Reactively fetch listings when user changes
      effect(() => {
        const user = this.auth.user();
        const isAdmin = this.auth.isAdmin();

        if (user) {
          // Note: no navigation here — profile refreshes (e.g. incrementUsage)
          // re-run this effect and must not yank the user off their current view.
          // Single fetch on initial load/auth change — poll=false avoids hammering
          // /api/listings every 5s for the whole session; saveListing/updateListing/
          // deleteListing call refreshListings() directly to keep the list in sync.
          if (isAdmin) {
            this.listingService.getAllListings((listings) => this.myListings.set(listings), false);
          } else {
            this.listingService.getListings(user.uid, (listings) => this.myListings.set(listings), false);
          }
        } else {
          this.myListings.set([]);
          if (this.mainView() === 'products' || this.mainView() === 'listings') {
            this.navigateTo('home');
          }
        }
      });
    }
  }

  setRating(rating: number) {
    this.currentFeedbackRating.set(rating);
  }

  async submitFeedback() {
    if (this.currentFeedbackRating() === 0) {
      const toast = await this.toastController?.create?.({
        message: 'Please select a rating',
        duration: 2000,
        color: 'warning'
      });
      if (toast) await toast.present();
      return;
    }

    try {
      await this.listingService.submitFeedback({
        listingId: this.pendingListingId() || 'manual',
        rating: this.currentFeedbackRating(),
        comment: this.currentFeedbackComment()
      });

      const toast = await this.toastController?.create?.({
        message: 'Thank you for your feedback!',
        duration: 2000,
        color: 'success'
      });
      if (toast) await toast.present();
      this.closeFeedbackModal();
    } catch (error) {
      console.error('Feedback submission failed:', error);
    }
  }

  closeFeedbackModal() {
    this.showFeedbackModal.set(false);
    this.currentFeedbackRating.set(0);
    this.currentFeedbackComment.set('');
    this.pendingListingId.set(null);
  }

  // Daily AI-usage allowance per plan. Keep in sync with the dashboard usage card.
  dailyLimit(): number {
    return this.auth.isPro() ? 50 : 5;
  }

  dailyUsage(): number {
    const profile = this.auth.profile();
    if (!profile) return 0;
    return profile.dailyStats?.date === this.today() ? (profile.dailyStats?.count || 0) : 0;
  }

  usagePercent(): number {
    return Math.min(100, (this.dailyUsage() / this.dailyLimit()) * 100);
  }

  private async checkUploadLimit(): Promise<boolean> {
    const profile = this.auth.profile();
    if (!profile) return true;

    // Admins are exempt from limits
    if (this.auth.isAdmin()) return true;

    const limit = this.dailyLimit();
    if (this.dailyUsage() >= limit) {
      const alert = await this.alertController?.create?.({
        header: 'Daily Limit Reached',
        subHeader: `You have reached your limit of ${limit} product uploads for today.`,
        message: 'Scale your business with SellAssist. Please come back tomorrow for more optimizations.',
        buttons: ['OK']
      });
      if (alert) await alert.present();
      return false;
    }
    return true;
  }

  /** Template-friendly price parser — turns "₹1,299" / 1299 into a plain number. */
  price(value: string | number | undefined | null): number {
    return parsePrice(value);
  }

  async saveListing() {
    if (!(await this.checkUploadLimit())) return;
    const details = this.productDetails();
    const original = this.selectedImage();
    if (!details || !original) return;

    if (!this.auth.user()) {
       const toast = await this.toastController?.create?.({
         message: 'Please login to save your listing',
         duration: 3000,
         color: 'warning',
         position: 'bottom'
       });
       if (toast) await toast.present();
       this.navigateTo('home'); // This will show login if not authenticated
       return;
    }

    const alert = await this.alertController?.create?.({
      header: 'Inventory Details',
      subHeader: 'Set price and stock level',
      inputs: [
        {
          name: 'price',
          type: 'number',
          placeholder: 'Selling Price (₹)',
          // priceINR is a display string ("₹1,299") — a number input rejects it
          // and silently saves 0, so prefill with the parsed numeric value.
          value: this.price(details.sellingPrice || details.priceINR) || ''
        },
        {
          name: 'cost',
          type: 'number',
          placeholder: 'Cost Price (₹)',
          value: this.price(details.costPrice) || ''
        },
        {
          name: 'quantity',
          type: 'number',
          placeholder: 'Quantity in Stock',
          value: details.quantity ?? 0
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Save to Inventory',
          handler: async (data) => {
            this.isSaving.set(true);
            try {
              const current = this.productDetails();
              const existingId = (current as Listing)?.id;

              const updatedDetails: ProductDetails = {
                ...details,
                priceINR: String(data.price || '').startsWith('₹') ? String(data.price) : `₹${data.price}`,
                sellingPrice: Number(data.price) || 0,
                costPrice: Number(data.cost) || 0,
                quantity: parseInt(data.quantity || '0', 10)
              };

              if (existingId) {
                await this.listingService.updateListing(existingId, updatedDetails);
              } else {
                const docRef = await this.listingService.saveListing(updatedDetails, original, this.processedImage());
                this.pendingListingId.set(docRef.id ?? null);
                this.showFeedbackModal.set(true);
              }

              const toast = await this.toastController?.create?.({
                message: existingId ? 'Listing updated successfully!' : 'Listing saved successfully!',
                duration: 2000,
                color: 'success',
                position: 'bottom'
              });
              if (toast) await toast.present();

              this.refreshListings();
              this.navigateTo('listings');
              this.reset();
            } catch (error) {
              console.error('Failed to save/update listing:', error);
              const toast = await this.toastController?.create?.({
                message: 'Failed to process listing. Please try again.',
                duration: 3000,
                color: 'danger',
                position: 'bottom'
              });
              if (toast) await toast.present();
            } finally {
              this.isSaving.set(false);
            }
          }
        }
      ]
    });

    if (alert) await alert.present();
  }

  async deleteListing(id: string | undefined) {
    if (!id) return;
    
    const alert = await this.alertController?.create?.({
      header: 'Confirm Deletion',
      message: 'Are you sure you want to permanently remove this listing from your inventory?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            try {
              await this.listingService.deleteListing(id);
              this.refreshListings();
              const toast = await this.toastController?.create?.({
                message: 'Listing removed from inventory',
                duration: 2000,
                color: 'success',
                position: 'bottom'
              });
              if (toast) await toast.present();
            } catch (error) {
              console.error('Delete failed:', error);
              const toast = await this.toastController?.create?.({
                message: 'Failed to delete listing. Permission denied.',
                duration: 3000,
                color: 'danger',
                position: 'bottom'
              });
              if (toast) await toast.present();
            }
          }
        }
      ]
    });

    if (alert) await alert.present();
  }

  async handleAddManualProduct(product: Partial<Listing>) {
    try {
      if (product.id) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...updates } = product;
        await this.listingService.updateListing(product.id, updates);
      } else {
        await this.listingService.saveListing(product as ProductDetails, '', null);
      }
      this.refreshListings();
      const toast = await this.toastController?.create?.({
        message: product.id ? 'Product updated successfully!' : 'Product added successfully!',
        duration: 3000,
        color: 'success',
        position: 'bottom'
      });
      if (toast) await toast.present();
    } catch (error) {
      console.error('Error saving manual product:', error);
      const toast = await this.toastController?.create?.({
        message: 'Failed to add product. Please try again.',
        duration: 3000,
        color: 'danger',
        position: 'bottom'
      });
      if (toast) await toast.present();
    }
  }

  viewListing(listing: Listing) {
    this.productDetails.set(listing);
    this.selectedImage.set(listing.originalImage);
    this.processedImage.set(listing.processedImage);
    this.navigateTo('home');
  }

  /** One-time re-fetch of listings, used by the Refresh button on the inventory page. */
  refreshListings() {
    const user = this.auth.user();
    if (!user) return;
    if (this.auth.isAdmin()) {
      this.listingService.getAllListings((listings) => this.myListings.set(listings), false);
    } else {
      this.listingService.getListings(user.uid, (listings) => this.myListings.set(listings), false);
    }
  }

  reset() {
    this.selectedImage.set(null);
    this.processedImage.set(null);
    this.productDetails.set(null);
    this.activeTab.set('details');
  }

  async loginWithEmail() {
    this.emailTouched.set(true);
    this.passwordTouched.set(true);
    this.authError.set(null);
    this.showResendVerification.set(false);
    // Inline field errors (from the touched flags above) already cover this — no need to repeat
    // the same message in the alert box below.
    if (!this.loginValid()) {
      return;
    }

    this.isProcessing.set(true);
    try {
      await this.auth.loginWithEmail(this.email(), this.password(), this.rememberMe());
      this.navigateTo('home');
      this.resetAuthForm();
    } catch (error: unknown) {
      const code = (error as { code?: string }).code || (error as Error).message;
      this.authError.set(this.getAuthErrorMessage(code));
      this.showResendVerification.set(code === 'auth/email-not-verified');
    } finally {
      this.isProcessing.set(false);
    }
  }

  async register() {
    this.emailTouched.set(true);
    this.passwordTouched.set(true);
    this.nameTouched.set(true);
    this.phoneTouched.set(true);
    this.confirmPasswordTouched.set(true);
    this.authError.set(null);

    // Inline field errors (from the touched flags above) already cover this — no need to repeat
    // the same message in the alert box below.
    if (!this.registrationValid()) {
      return;
    }

    this.isProcessing.set(true);
    try {
      const registeredEmail = this.email();
      await this.auth.registerWithEmail(registeredEmail, this.password(), {
        displayName: this.regName().trim(),
        phoneNumber: this.regPhone().replace(/\D/g, ''),
        gstNumber: this.regGST().trim(),
      });
      this.resetAuthForm();
      this.verificationPendingEmail.set(registeredEmail);
    } catch (error: unknown) {
      const code = (error as { code?: string }).code || (error as Error).message;
      this.authError.set(this.getAuthErrorMessage(code));
    } finally {
      this.isProcessing.set(false);
    }
  }

  async resendVerificationEmail() {
    const email = this.verificationPendingEmail() || this.email();
    if (!email) return;

    this.isResendingVerification.set(true);
    this.resendVerificationSent.set(false);
    try {
      await this.auth.resendVerification(email);
      this.resendVerificationSent.set(true);
    } catch (error) {
      console.error('Resend verification failed', error);
      this.authError.set('Failed to resend verification email. Please try again.');
    } finally {
      this.isResendingVerification.set(false);
    }
  }

  private async verifyEmailFromLink(token: string) {
    this.emailVerificationState.set('verifying');
    try {
      await this.auth.verifyEmail(token, this.rememberMe());
      this.emailVerificationState.set('success');
    } catch (error) {
      this.emailVerificationState.set('error');
      this.emailVerificationError.set(
        (error instanceof Error && error.message) || 'Your verification link has expired. Request a new verification email.',
      );
    }
  }

  async loadMarketplaceConnections() {
    if (!this.auth.user()) return;
    this.loadingMarketplaceConnections.set(true);
    try {
      const data = await this.marketplaceConnections.getConnections();
      this.marketplaceConnectionsData.set(data);
    } catch (error) {
      console.error('Failed to load marketplace connections', error);
    } finally {
      this.loadingMarketplaceConnections.set(false);
    }
  }

  async connectAmazon() {
    this.connectingAmazon.set(true);
    this.marketplaceConnectionMessage.set(null);
    try {
      const authorizeUrl = await this.marketplaceConnections.getAmazonAuthorizeUrl();
      window.location.href = authorizeUrl;
    } catch (error) {
      console.error('Failed to start Amazon connection', error);
      this.marketplaceConnectionMessage.set(
        (error instanceof Error && error.message) || 'Failed to start Amazon connection. Please try again.',
      );
      this.connectingAmazon.set(false);
    }
  }

  async disconnectMarketplace(marketplace: 'amazon' | 'flipkart') {
    if (!confirm(`Disconnect your ${marketplace === 'amazon' ? 'Amazon' : 'Flipkart'} account? You'll need to re-authorize to reconnect.`)) return;

    this.disconnectingMarketplace.set(marketplace);
    try {
      await this.marketplaceConnections.disconnect(marketplace);
      await this.loadMarketplaceConnections();
    } catch (error) {
      console.error('Failed to disconnect marketplace', error);
      this.marketplaceConnectionMessage.set('Failed to disconnect. Please try again.');
    } finally {
      this.disconnectingMarketplace.set(null);
    }
  }

  private resetAuthForm() {
    this.email.set('');
    this.password.set('');
    this.confirmPassword.set('');
    this.regName.set('');
    this.regPhone.set('');
    this.regGST.set('');
    this.isRegistering.set(false);
    this.emailTouched.set(false);
    this.passwordTouched.set(false);
    this.nameTouched.set(false);
    this.phoneTouched.set(false);
    this.confirmPasswordTouched.set(false);
  }

  private getAuthErrorMessage(code: string): string {
    switch (code) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Try signing in instead.';
      case 'auth/phone-already-in-use':
        return 'This mobile number is already registered to another account.';
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/weak-password':
        return 'Password is too weak. Use at least 8 characters with a mix of upper/lowercase letters, a number, and a special character.';
      case 'auth/too-many-requests':
        return 'Too many login attempts. Please wait 15 minutes and try again.';
      case 'auth/email-not-verified':
        return 'Your email address has not been verified. Please verify your email before logging in.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        // Intentionally the same message for "no such account" and "wrong password" — telling
        // them apart lets an attacker discover which emails are registered (the same reason
        // /forgot-password always returns a generic response).
        return 'Incorrect email or password. Please try again.';
      default:
        return 'Something went wrong signing you in. Please try again.';
    }
  }

  toggleRegister() {
    this.isRegistering.set(!this.isRegistering());
    this.authError.set(null);
    this.showResendVerification.set(false);
    this.resendVerificationSent.set(false);
  }

  async logout() {
    try {
      await this.auth.logout();
      this.navigateTo('landing');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.processSelectedFile(file);
  }

  async onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) {
      await this.processSelectedFile(file);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
  }

  private async processSelectedFile(file: File) {
    this.processingStage.set('resizing');
    const reader = new FileReader();
    reader.onload = async () => {
      let base64 = reader.result as string;
      try {
        base64 = await resizeImage(base64, 1200, 1200);
      } catch (e) {
        console.warn('Resize failed, using original', e);
      }
      this.selectedImage.set(base64);
      this.processedImage.set(null);
      this.productDetails.set(null);
      this.isEditingImage.set(true);
      // Start AI analysis in background while user edits
      this.extractDetailsBackground(base64, file.type);
    };
    reader.readAsDataURL(file);
  }

  async extractDetailsBackground(base64WithPrefix: string, mimeType: string) {
    const base64 = base64WithPrefix.split(',')[1];
    this.isProcessing.set(true);
    try {
      const details = await this.gemini.extractProductDetails(base64, mimeType, this.templateService.templates(), this.auth.isPro());
      this.productDetails.set(details);
      await this.auth.incrementUsage();
    } catch (error) {
      console.error("Error extracting details:", error);
      const message = error instanceof Error ? error.message : String(error);
      const isOverloaded = message.includes('UNAVAILABLE') || message.includes('high demand');
      const toast = await this.toastController?.create?.({
        message: isOverloaded
          ? 'AI is experiencing high demand right now. Please try uploading again in a moment.'
          : 'Failed to analyze the image. Please try again.',
        duration: 4000,
        color: 'danger',
        position: 'bottom'
      });
      if (toast) await toast.present();
    } finally {
      this.isProcessing.set(false);
    }
  }

  onEditorComplete(editedImage: string) {
    this.processedImage.set(editedImage);
    this.isEditingImage.set(false);
    this.processingStage.set('idle');
  }

  onEditorCancel() {
    this.isEditingImage.set(false);
    this.reset();
  }

  copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text);
    this.copiedField.set(field);
    setTimeout(() => this.copiedField.set(null), 2000);
  }

  toggleEdit(field: string) {
    if (this.editingField() === field) {
      this.editingField.set(null);
    } else {
      this.editingField.set(field);
    }
  }

  updateField(path: string, value: unknown) {
    const details = this.productDetails();
    if (!details) return;

    const newDetails = { ...details };
    const parts = path.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = newDetails;

    for (let i = 0; i < parts.length - 1; i++) {
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;

    this.productDetails.set(newDetails);
  }

  updateVariation(index: number, value: unknown) {
    const details = this.productDetails();
    if (!details) return;

    const newDetails = { ...details };
    newDetails.variations[index] = String(value ?? '');
    this.productDetails.set(newDetails);
  }

  updatePlatformArrayField(platformId: string, fieldId: string, index: number, value: unknown) {
    const details = this.productDetails();
    if (!details) return;

    const newDetails = { ...details };
    const platform = newDetails.platformContent[platformId];
    if (!platform) return;
    
    const field = platform[fieldId];
    if (!Array.isArray(field)) return;

    field[index] = String(value ?? '').replace(/^#/, '');
    this.productDetails.set(newDetails);
  }

  // Template Management
  updateTemplatePlatform(platformId: string, enabled: boolean) {
    const configs = [...this.templateService.templates()];
    const index = configs.findIndex(c => c.id === platformId);
    if (index === -1) return;

    configs[index] = { ...configs[index], enabled };
    this.templateService.saveTemplates(configs);
  }

  shareOnSocial(platform: 'facebook' | 'twitter' | 'instagram', contentPlatformId: string) {
    const details = this.productDetails();
    if (!details) return;

    let text = '';
    
    if (contentPlatformId === 'details') {
      text = `${details.name}\n\nPrice: ₹${details.priceINR}\n\n${details.description}`;
    } else {
      const platformContent = details.platformContent[contentPlatformId];
      if (!platformContent) return;

      if (contentPlatformId === 'instagram') {
        const caption = platformContent['caption'] as string;
        const hashtags = (platformContent['hashtags'] as string[] || []).map(h => '#' + h).join(' ');
        text = `${caption}\n\n${hashtags}`;
      } else {
        const title = platformContent['title'] || details.name;
        const desc = platformContent['description'] || platformContent['highlights'] || '';
        text = `${title}\n\n${Array.isArray(desc) ? desc.join('\n') : desc}`;
      }
    }

    const url = window.location.href;

    switch (platform) {
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`, '_blank');
        break;
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
        break;
      case 'instagram':
        this.copyToClipboard(text, 'share-ig');
        // Instagram doesn't support direct text sharing via web URL easily, so we copy and inform
        alert('Caption copied! Open Instagram to paste and share your post.');
        break;
    }
  }

  updateTemplateField(platformId: string, fieldId: string, enabled: boolean) {
    const configs = [...this.templateService.templates()];
    const pIndex = configs.findIndex(c => c.id === platformId);
    if (pIndex === -1) return;

    const fIndex = configs[pIndex].fields.findIndex(f => f.id === fieldId);
    if (fIndex === -1) return;

    const newFields = [...configs[pIndex].fields];
    newFields[fIndex] = { ...newFields[fIndex], enabled };
    configs[pIndex] = { ...configs[pIndex], fields: newFields };
    this.templateService.saveTemplates(configs);
  }

  updateTemplatePrompt(platformId: string, prompt: string) {
    const configs = [...this.templateService.templates()];
    const index = configs.findIndex(c => c.id === platformId);
    if (index === -1) return;

    configs[index] = { ...configs[index], customPrompt: prompt };
    this.templateService.saveTemplates(configs);
  }

  moveField(platformId: string, fieldId: string, direction: 'up' | 'down') {
    const configs = [...this.templateService.templates()];
    const pIndex = configs.findIndex(c => c.id === platformId);
    if (pIndex === -1) return;

    const fields = [...configs[pIndex].fields];
    const fIndex = fields.findIndex(f => f.id === fieldId);
    if (fIndex === -1) return;

    const newIndex = direction === 'up' ? fIndex - 1 : fIndex + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;

    const temp = fields[fIndex];
    fields[fIndex] = fields[newIndex];
    fields[newIndex] = temp;

    // Refresh orders
    fields.forEach((f, i) => f.order = i);

    configs[pIndex] = { ...configs[pIndex], fields };
    this.templateService.saveTemplates(configs);
  }
}
