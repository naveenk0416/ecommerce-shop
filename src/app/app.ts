import { ChangeDetectionStrategy, Component, signal, inject, PLATFORM_ID, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Title, Meta } from '@angular/platform-browser';
import { Router, RouterLink, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { IonApp, IonHeader, IonToolbar, IonContent, 
  IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, 
  IonCardContent, IonLabel, IonBadge, IonSpinner,
  IonSegment, IonSegmentButton, IonInput, IonTextarea,
  ToastController, AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { camera, cloudUpload, sparkles, image, list, pricetag, copy, checkmark, logIn, logOut, logOutOutline, personCircle, pencil, save, logoGoogle, arrowForward, arrowBack, flash, rocket, shieldCheckmark, close, cube, settings, chevronUpOutline, chevronDownOutline, logoFacebook, logoInstagram, logoTwitter, shareSocial, shieldCheckmarkOutline, calculator, informationCircle, lockClosed, mailOutline, fingerPrintOutline, calendarOutline, ellipsisHorizontal, chevronForwardOutline, refresh, star, trendingUp } from 'ionicons/icons';
import { GeminiService, ProductDetails } from './services/gemini';
import { AuthService } from './services/auth';
import { ListingService, Listing } from './services/listing';
import { TemplateService } from './services/template';
import { Landing } from './landing';
import { Products } from './products';
import { AdminComponent } from './admin';
import { Pricing } from './pricing';
import { GstCalculator } from './gst-calculator';
import { ImageEditor } from './image-editor';
import { resizeImage } from './utils/image';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, FormsModule, Landing, Products, AdminComponent, GstCalculator, Pricing, ImageEditor,
    RouterLink, RouterOutlet,
    IonApp, IonHeader, IonToolbar, IonContent, 
    IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, 
    IonCardContent, IonLabel, IonBadge, IonSpinner,
    IonSegment, IonSegmentButton, IonInput, IonTextarea
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private gemini = inject(GeminiService);
  public auth = inject(AuthService);
  private listingService = inject(ListingService);
  public templateService = inject(TemplateService);
  private platformId = inject(PLATFORM_ID);
  private toastController = inject(ToastController);
  private alertController = inject(AlertController);
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
  mainView = signal<'home' | 'listings' | 'products' | 'settings' | 'admin' | 'gst'>('home');
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

  // Additional Registration Fields
  regName = signal('');
  regPhone = signal('');
  regGST = signal('');

  isRegistering = signal(false);
  isLinkSent = signal(false);
  isSendingLink = signal(false);
  authError = signal<string | null>(null);

  private syncViewWithUrl(path: string) {
    if (path === '/' || path === '/home') {
      this.showLanding.set(true);
    } else {
      this.showLanding.set(false);
      if (path === '/listings') this.mainView.set('listings');
      else if (path === '/inventory') this.mainView.set('products');
      else if (path === '/gst-calculator') this.mainView.set('gst');
      else if (path === '/admin') this.mainView.set('admin');
      else if (path === '/optimize') this.mainView.set('home');
    }
  }

  navigateTo(view: 'home' | 'listings' | 'products' | 'gst' | 'admin' | 'landing') {
    if (view === 'landing') {
      this.showLanding.set(true);
      this.router.navigate(['/home']);
    } else {
      this.showLanding.set(false);
      this.mainView.set(view);
      const path = view === 'products' ? 'inventory' : (view === 'gst' ? 'gst-calculator' : (view === 'home' ? 'optimize' : view));
      this.router.navigate(['/' + path]);
    }
  }

  constructor() {
    addIcons({ camera, cloudUpload, sparkles, image, list, pricetag, copy, checkmark, logIn, logOut, logOutOutline, personCircle, pencil, save, logoGoogle, arrowForward, arrowBack, flash, rocket, shieldCheckmark, shieldCheckmarkOutline, close, cube, settings, chevronUpOutline, chevronDownOutline, logoFacebook, logoInstagram, logoTwitter, shareSocial, calculator, informationCircle, lockClosed, mailOutline, fingerPrintOutline, calendarOutline, ellipsisHorizontal, chevronForwardOutline, refresh, star, trendingUp });
    
    // Subscribe to route changes
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.syncViewWithUrl(event.urlAfterRedirects);
    });

    if (isPlatformBrowser(this.platformId)) {
      // URL Sync Logic
      const initUrl = window.location.href;
      this.syncViewWithUrl(window.location.pathname);

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

      // Handle Firebase Email Link Login
      const currentUrl = window.location.href;
      if (this.auth.isLoginLink(currentUrl)) {
        let email = window.localStorage.getItem('emailForSignIn');
        if (!email) {
          // If the link was opened on a different device, ask for the email
          email = window.prompt('Please provide your email for confirmation');
        }
        if (email) {
          this.auth.signInWithLink(email, currentUrl).then(() => {
            this.navigateTo('home');
            window.history.replaceState({}, '', window.location.pathname);
          }).catch(err => {
            console.error('Link sign-in error:', err);
            this.authError.set('Failed to sign in with that link. It may have expired.');
          });
        }
      }
      // Reactively fetch listings when user changes
      effect((onCleanup) => {
        const user = this.auth.user();
        const isAdmin = this.auth.isAdmin();
        
        if (user) {
          this.navigateTo('home');
          const fetchMethod = isAdmin ? 
            this.listingService.getAllListings.bind(this.listingService) : 
            this.listingService.getListings.bind(this.listingService, user.uid);

          const unsubscribe = fetchMethod((listings) => {
            this.myListings.set(listings);
          });
          onCleanup(() => unsubscribe());
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
      const toast = await this.toastController.create({
        message: 'Please select a rating',
        duration: 2000,
        color: 'warning'
      });
      await toast.present();
      return;
    }

    try {
      await this.listingService.submitFeedback({
        listingId: this.pendingListingId() || 'manual',
        rating: this.currentFeedbackRating(),
        comment: this.currentFeedbackComment()
      });

      const toast = await this.toastController.create({
        message: 'Thank you for your feedback!',
        duration: 2000,
        color: 'success'
      });
      await toast.present();
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

  private async checkUploadLimit(): Promise<boolean> {
    const profile = this.auth.profile();
    if (!profile) return true;
    
    // Admins are exempt from limits
    if (this.auth.isAdmin()) return true;

    const todayStr = this.today();
    const dailyCount = profile.dailyStats?.date === todayStr ? (profile.dailyStats?.count || 0) : 0;
    
    if (dailyCount >= 7) {
      const alert = await this.alertController.create({
        header: 'Daily Limit Reached',
        subHeader: 'You have reached your limit of 7 product uploads for today.',
        message: 'Scale your business with SellAssist. Please come back tomorrow for more optimizations.',
        buttons: ['OK']
      });
      await alert.present();
      return false;
    }
    return true;
  }

  async saveListing() {
    if (!(await this.checkUploadLimit())) return;
    const details = this.productDetails();
    const original = this.selectedImage();
    if (!details || !original) return;

    if (!this.auth.user()) {
       const toast = await this.toastController.create({
         message: 'Please login to save your listing',
         duration: 3000,
         color: 'warning',
         position: 'bottom'
       });
       await toast.present();
       this.navigateTo('home'); // This will show login if not authenticated
       return;
    }

    const alert = await this.alertController.create({
      header: 'Inventory Details',
      subHeader: 'Set price and stock level',
      inputs: [
        {
          name: 'price',
          type: 'number',
          placeholder: 'Selling Price (₹)',
          value: details.priceINR || details.sellingPrice || ''
        },
        {
          name: 'cost',
          type: 'number',
          placeholder: 'Cost Price (₹)',
          value: details.costPrice || ''
        },
        {
          name: 'quantity',
          type: 'number',
          placeholder: 'Quantity in Stock',
          value: details.quantity || '0'
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
                this.pendingListingId.set(docRef.id);
                this.showFeedbackModal.set(true);
              }

              const toast = await this.toastController.create({
                message: existingId ? 'Listing updated successfully!' : 'Listing saved successfully!',
                duration: 2000,
                color: 'success',
                position: 'bottom'
              });
              await toast.present();

              this.navigateTo('listings');
              this.reset();
            } catch (error) {
              console.error('Failed to save/update listing:', error);
              const toast = await this.toastController.create({
                message: 'Failed to process listing. Please try again.',
                duration: 3000,
                color: 'danger',
                position: 'bottom'
              });
              await toast.present();
            } finally {
              this.isSaving.set(false);
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async deleteListing(id: string | undefined) {
    if (!id) return;
    
    const alert = await this.alertController.create({
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
              const toast = await this.toastController.create({
                message: 'Listing removed from inventory',
                duration: 2000,
                color: 'success',
                position: 'bottom'
              });
              await toast.present();
            } catch (error) {
              console.error('Delete failed:', error);
              const toast = await this.toastController.create({
                message: 'Failed to delete listing. Permission denied.',
                duration: 3000,
                color: 'danger',
                position: 'bottom'
              });
              await toast.present();
            }
          }
        }
      ]
    });

    await alert.present();
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
      const toast = await this.toastController.create({
        message: product.id ? 'Product updated successfully!' : 'Product added successfully!',
        duration: 3000,
        color: 'success',
        position: 'bottom'
      });
      await toast.present();
    } catch (error) {
      console.error('Error saving manual product:', error);
      const toast = await this.toastController.create({
        message: 'Failed to add product. Please try again.',
        duration: 3000,
        color: 'danger',
        position: 'bottom'
      });
      await toast.present();
    }
  }

  viewListing(listing: Listing) {
    this.productDetails.set(listing);
    this.selectedImage.set(listing.originalImage);
    this.processedImage.set(listing.processedImage);
    this.navigateTo('home');
  }

  reset() {
    this.selectedImage.set(null);
    this.processedImage.set(null);
    this.productDetails.set(null);
    this.activeTab.set('details');
  }

  async loginWithGoogle() {
    this.authError.set(null);
    try {
      await this.auth.loginWithGoogle();
      this.navigateTo('home');
    } catch (error) {
      console.error('Login failed:', error);
      this.authError.set('Google login failed. Please try again.');
    }
  }

  async loginWithEmail() {
    this.authError.set(null);
    if (!this.email() || !this.password()) {
      this.authError.set('Please enter both email and password.');
      return;
    }

    this.isProcessing.set(true);
    try {
      await this.auth.loginWithEmail(this.email(), this.password());
      this.navigateTo('home');
      this.resetAuthForm();
    } catch (error: unknown) {
      const code = (error as { code?: string }).code || (error as Error).message;
      this.authError.set(this.getAuthErrorMessage(code));
    } finally {
      this.isProcessing.set(false);
    }
  }

  async register() {
    this.authError.set(null);
    if (!this.email() || !this.password()) {
      this.authError.set('Please enter both email and password.');
      return;
    }

    if (this.password().length < 6) {
      this.authError.set('Password should be at least 6 characters.');
      return;
    }

    this.isProcessing.set(true);
    try {
      await this.auth.registerWithEmail(this.email(), this.password(), {
        displayName: this.regName(),
        phoneNumber: this.regPhone(),
        gstNumber: this.regGST()
      });
      this.navigateTo('home');
      this.resetAuthForm();
    } catch (error: unknown) {
      const code = (error as { code?: string }).code || (error as Error).message;
      this.authError.set(this.getAuthErrorMessage(code));
    } finally {
      this.isProcessing.set(false);
    }
  }

  private resetAuthForm() {
    this.email.set('');
    this.password.set('');
    this.regName.set('');
    this.regPhone.set('');
    this.regGST.set('');
    this.isRegistering.set(false);
  }

  private getAuthErrorMessage(code: string): string {
    switch (code) {
      case 'auth/email-already-in-use':
        return 'This email is already registered.';
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/weak-password':
        return 'Password is too weak.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Invalid email or password.';
      default:
        return 'Authentication failed. Please try again.';
    }
  }

  async emailAuth() {
    this.authError.set(null);
    if (!this.email()) {
      this.authError.set('Please enter your email.');
      return;
    }

    this.isSendingLink.set(true);
    try {
      await this.auth.sendLoginLink(this.email());
      this.isLinkSent.set(true);
      const toast = await this.toastController.create({
        message: 'Login link sent to your email!',
        duration: 5000,
        color: 'success',
        position: 'bottom'
      });
      await toast.present();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send login link.';
      this.authError.set(message);
    } finally {
      this.isSendingLink.set(false);
    }
  }

  toggleRegister() {
    this.isRegistering.set(!this.isRegistering());
    this.isLinkSent.set(false);
    this.authError.set(null);
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
