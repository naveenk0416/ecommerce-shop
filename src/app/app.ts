import { ChangeDetectionStrategy, Component, signal, inject, PLATFORM_ID, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonApp, IonHeader, IonToolbar, IonTitle, IonContent, 
  IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, 
  IonCardContent, IonLabel, IonBadge, IonSpinner,
  IonSegment, IonSegmentButton, IonInput, IonTextarea, IonToggle,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { camera, cloudUpload, sparkles, image, list, pricetag, copy, checkmark, logIn, logOut, personCircle, pencil, save, logoGoogle, arrowForward, flash, rocket, shieldCheckmark, close, cube, settings, chevronUpOutline, chevronDownOutline, logoFacebook, logoInstagram, logoTwitter, shareSocial } from 'ionicons/icons';
import { GeminiService, ProductDetails } from './services/gemini';
import { AuthService } from './services/auth';
import { ListingService, Listing } from './services/listing';
import { TemplateService } from './services/template';
import { Landing } from './landing';
import { Products } from './products';
import { resizeImage } from './utils/image';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, FormsModule, Landing, Products,
    IonApp, IonHeader, IonToolbar, IonTitle, IonContent, 
    IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, 
    IonCardContent, IonLabel, IonBadge, IonSpinner,
    IonSegment, IonSegmentButton, IonInput, IonTextarea, IonToggle
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
  isSaving = signal(false);
  productDetails = signal<ProductDetails | null>(null);
  activeTab = signal<string>('details');
  mainView = signal<'home' | 'listings' | 'products' | 'settings'>('home');
  myListings = signal<Listing[]>([]);
  copiedField = signal<string | null>(null);
  editingField = signal<string | null>(null);

  // Auth Form State
  email = signal('');
  password = signal('');
  isRegistering = signal(false);
  authError = signal<string | null>(null);

  constructor() {
    addIcons({ camera, cloudUpload, sparkles, image, list, pricetag, copy, checkmark, logIn, logOut, personCircle, pencil, save, logoGoogle, arrowForward, flash, rocket, shieldCheckmark, close, cube, settings, chevronUpOutline, chevronDownOutline, logoFacebook, logoInstagram, logoTwitter, shareSocial });
    
    if (isPlatformBrowser(this.platformId)) {
      // Reactively fetch listings when user changes
      effect(() => {
        const user = this.auth.user();
        if (user) {
          const unsubscribe = this.listingService.getListings(user.uid, (listings) => {
            this.myListings.set(listings);
          });
          return () => unsubscribe();
        } else {
          this.myListings.set([]);
          return;
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
        message: 'Listing saved successfully to SellerSathi!',
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

    try {
      if (this.isRegistering()) {
        await this.auth.registerWithEmail(this.email(), this.password());
      } else {
        await this.auth.loginWithEmail(this.email(), this.password());
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.authError.set(error.message || 'Authentication failed.');
    }
  }

  async logout() {
    try {
      await this.auth.logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

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
    const base64 = base64WithPrefix.split(',')[1];
    this.isProcessing.set(true);
    
    try {
      const details = await this.gemini.extractProductDetails(base64, mimeType, this.templateService.templates());
      this.productDetails.set(details);
      
      // Start generating white background in parallel
      this.generateWhiteBg(base64, mimeType);
    } catch (error) {
      console.error("Error processing image:", error);
    } finally {
      this.isProcessing.set(false);
    }
  }

  async generateWhiteBg(base64: string, mimeType: string) {
    this.isGeneratingImage.set(true);
    try {
      let newImage = await this.gemini.generateWhiteBackground(base64, mimeType);
      try {
        newImage = await resizeImage(newImage, 1200, 1200);
      } catch (e) {
        console.warn('Processed image resize failed', e);
      }
      this.processedImage.set(newImage);
    } catch (error) {
      console.error("Error generating white background:", error);
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
