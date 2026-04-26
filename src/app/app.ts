import { ChangeDetectionStrategy, Component, signal, inject, PLATFORM_ID, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonApp, IonHeader, IonToolbar, IonContent, 
  IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, 
  IonCardContent, IonLabel, IonBadge, IonSpinner,
  IonSegment, IonSegmentButton, IonInput, IonTextarea,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { camera, cloudUpload, sparkles, image, list, pricetag, copy, checkmark, logIn, logOut, logOutOutline, personCircle, pencil, save, logoGoogle, arrowForward, arrowBack, flash, rocket, shieldCheckmark, close, cube, settings, chevronUpOutline, chevronDownOutline, logoFacebook, logoInstagram, logoTwitter, shareSocial, shieldCheckmarkOutline, calculator, informationCircle, lockClosed, mailOutline, fingerPrintOutline, calendarOutline, ellipsisHorizontal, chevronForwardOutline, refresh, star, eye, trash } from 'ionicons/icons';
import { GeminiService, ProductDetails } from './services/gemini';
import { AuthService } from './services/auth';
import { ListingService, Listing } from './services/listing';
import { TemplateService } from './services/template';
import { Landing } from './landing';
import { Products } from './products';
import { AdminComponent } from './admin';
import { Pricing } from './pricing';
import { GstCalculator } from './gst-calculator';
import { resizeImage } from './utils/image';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, FormsModule, Landing, Products, AdminComponent, GstCalculator, Pricing,
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

  showLanding = signal(true);
  selectedImage = signal<string | null>(null);
  processedImage = signal<string | null>(null);
  isProcessing = signal(false);
  isGeneratingImage = signal(false);
  isDragging = signal(false);
  processingStage = signal<string>('idle'); // idle, resizing, uploading, analyzing, background
  isSaving = signal(false);
  productDetails = signal<ProductDetails | null>(null);
  activeTab = signal<string>('details');
  mainView = signal<'home' | 'listings' | 'products' | 'settings' | 'admin' | 'gst' | 'pricing'>('home');
  myListings = signal<Listing[]>([]);
  copiedField = signal<string | null>(null);
  editingField = signal<string | null>(null);

  // Auth Form State
  email = signal('');
  password = signal('');

  // Additional Registration Fields
  regName = signal('');
  regPhone = signal('');
  regGST = signal('');

  isRegistering = signal(false);
  isVerifyingOTP = signal(false);
  isSendingOTP = signal(false);
  otpCode = signal('');
  authError = signal<string | null>(null);

  constructor() {
    addIcons({calculator,shieldCheckmark,logOut,close,personCircle,arrowBack,logoGoogle,arrowForward,cloudUpload,sparkles,image,logoFacebook,logoTwitter,logoInstagram,save,list,eye,trash,camera,pricetag,copy,checkmark,logIn,logOutOutline,pencil,flash,rocket,shieldCheckmarkOutline,cube,settings,chevronUpOutline,chevronDownOutline,shareSocial,informationCircle,lockClosed,mailOutline,fingerPrintOutline,calendarOutline,ellipsisHorizontal,chevronForwardOutline,refresh,star});
    
    if (isPlatformBrowser(this.platformId)) {
      // Reactively fetch listings when user changes
      effect((onCleanup) => {
        const user = this.auth.user();
        const isAdmin = this.auth.isAdmin();
        
        if (user) {
          this.mainView.set('home');
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
            this.mainView.set('home');
          }
        }
      });
    }
  }

  async saveListing() {
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
       this.showLanding.set(false); // Open auth modal
       return;
    }

    this.isSaving.set(true);
    try {
      await this.listingService.saveListing(details, original, this.processedImage());
      const toast = await this.toastController.create({
        message: 'Listing saved successfully to SellAssist!',
        duration: 2000,
        color: 'success',
        position: 'bottom'
      });
      await toast.present();
      this.mainView.set('listings');
    } catch (error) {
      console.error('Failed to save listing:', error);
      const toast = await this.toastController.create({
        message: 'Failed to save listing. Please try again.',
        duration: 3000,
        color: 'danger',
        position: 'bottom'
      });
      await toast.present();
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteListing(id: string | undefined) {
    if (!id) return;
    await this.listingService.deleteListing(id);
  }

  async handleAddManualProduct(product: Partial<Listing>) {
    try {
      await this.listingService.saveListing(product as ProductDetails, '', null);
      const toast = await this.toastController.create({
        message: 'Product added successfully!',
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
    this.mainView.set('home');
  }

  reset() {
    this.selectedImage.set(null);
    this.processedImage.set(null);
    this.productDetails.set(null);
    this.activeTab.set('details');
  }

  async login() {
    this.authError.set(null);
    try {
      await this.auth.loginWithGoogle();
      this.showLanding.set(false);
    } catch (error) {
      console.error('Login failed:', error);
      this.authError.set('Google login failed. Please try again.');
    }
  }

  async emailAuth() {
    this.authError.set(null);
    if (!this.email() || !this.password()) {
      this.authError.set('Please enter both email and password.');
      return;
    }

    if (this.isRegistering() && !this.isVerifyingOTP()) {
      this.resendOTP();
      return;
    }

    try {
      if (this.isRegistering()) {
        const isValid = await this.auth.verifyOTP(this.email(), this.otpCode());
        if (!isValid) {
          this.authError.set('Invalid or expired verification code.');
          return;
        }

        await this.auth.registerWithEmail(
          this.email(), 
          this.password(), 
          { 
            displayName: this.regName(), 
            phoneNumber: this.regPhone(), 
            gstNumber: this.regGST() 
          }
        );
        this.isVerifyingOTP.set(false);
        this.otpCode.set('');
        this.showLanding.set(false);
      } else {
        await this.auth.loginWithEmail(this.email(), this.password());
        this.showLanding.set(false);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.code === 'auth/operation-not-allowed') {
        this.authError.set('Email login is currently disabled in Firebase. Please enable it in the console or use Google Login below.');
      } else {
        this.authError.set(error.message || 'Authentication failed.');
      }
    }
  }

  async resendOTP() {
    this.authError.set(null);
    this.isSendingOTP.set(true);
    try {
      await this.auth.sendOTP(this.email());
      this.isVerifyingOTP.set(true);
      const toast = await this.toastController.create({
        message: 'Verification code sent to your email!',
        duration: 3000,
        color: 'success',
        position: 'bottom'
      });
      await toast.present();
    } catch (error: any) {
      this.authError.set('Failed to send OTP. ' + (error.message || ''));
    } finally {
      this.isSendingOTP.set(false);
    }
  }

  toggleRegister() {
    this.isRegistering.set(!this.isRegistering());
    this.isVerifyingOTP.set(false);
    this.otpCode.set('');
    this.authError.set(null);
  }

  async logout() {
    try {
      await this.auth.logout();
      this.showLanding.set(true);
      this.mainView.set('home');
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
      await this.processImage(base64, file.type);
    };
    reader.readAsDataURL(file);
  }

  async processImage(base64WithPrefix: string, mimeType: string) {
    const profile = this.auth.profile();
    if (profile) {
      if (profile.role === 'FREE' && profile.usageCount >= 5) {
        const toast = await this.toastController.create({
          message: 'Free limit reached (5 listings). Please upgrade to PAID_PRO for more.',
          duration: 5000,
          color: 'warning',
          position: 'top',
          buttons: [{ text: 'Upgrade', handler: () => this.mainView.set('settings') }]
        });
        await toast.present();
        return;
      }

      if (profile.role === 'PAID_PRO') {
        const today = new Date().toISOString().split('T')[0];
        if (profile.dailyStats?.date === today && profile.dailyStats.count >= 50) {
          const toast = await this.toastController.create({
            message: 'Daily limit reached (50 listings). See you tomorrow!',
            duration: 5000,
            color: 'warning',
            position: 'top'
          });
          await toast.present();
          return;
        }
      }
    }

    const base64 = base64WithPrefix.split(',')[1];
    this.isProcessing.set(true);
    this.processingStage.set('analyzing');
    
    try {
      const details = await this.gemini.extractProductDetails(base64, mimeType, this.templateService.templates(), this.auth.isPro());
      this.productDetails.set(details);
      await this.auth.incrementUsage();
      
      // Start generating white background in parallel
      this.generateWhiteBg(base64, mimeType);
    } catch (error) {
      console.error("Error processing image:", error);
      this.processingStage.set('idle');
    } finally {
      this.isProcessing.set(false);
    }
  }

  async generateWhiteBg(base64: string, mimeType: string) {
    this.isGeneratingImage.set(true);
    const prevStage = this.processingStage();
    this.processingStage.set('background');
    try {
      let newImage = await this.gemini.generateWhiteBackground(base64, mimeType);
      try {
        newImage = await resizeImage(newImage, 1200, 1200);
      } catch (e) {
        console.warn('Processed image resize failed', e);
      }
      this.processedImage.set(newImage);
      this.processingStage.set('complete');
      setTimeout(() => this.processingStage.set('idle'), 3000);
    } catch (error) {
      console.error("Error generating white background:", error);
      this.processingStage.set(prevStage);
    } finally {
      this.isGeneratingImage.set(false);
    }
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
