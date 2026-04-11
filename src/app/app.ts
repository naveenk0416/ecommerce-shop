import { ChangeDetectionStrategy, Component, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { 
  IonApp, IonHeader, IonToolbar, IonTitle, IonContent, 
  IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, 
  IonCardContent, IonLabel, IonBadge, IonSpinner,
  IonSegment, IonSegmentButton, IonItem, IonInput, IonText,
  IonAvatar, IonButtons, IonMenuButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  camera, cloudUpload, sparkles, image, list, pricetag, 
  copy, checkmark, logIn, logOut, person, business, 
  call, mail, location
} from 'ionicons/icons';
import { GeminiService, ProductDetails } from './services/gemini';
import { auth, db } from './firebase';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, 
  User, signOut 
} from 'firebase/auth';
import { 
  doc, getDoc, setDoc, serverTimestamp 
} from 'firebase/firestore';

interface SellerProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  gstNumber: string;
  gstName: string;
  businessAddress: string;
  createdAt: any;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    IonApp, IonHeader, IonToolbar, IonTitle, IonContent, 
    IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, 
    IonCardContent, IonLabel, IonBadge, IonSpinner,
    IonSegment, IonSegmentButton, IonItem, IonInput, IonText,
    IonAvatar, IonButtons, IonMenuButton
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private gemini = inject(GeminiService);
  private fb = inject(FormBuilder);

  // Auth State
  user = signal<User | null>(null);
  isAuthReady = signal(false);
  sellerProfile = signal<SellerProfile | null>(null);
  isProfileLoading = signal(false);

  // Registration Form
  registrationForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, Validators.pattern('^[0-9]{10,15}$')]],
    gstNumber: ['', [Validators.required, Validators.pattern('^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')]],
    gstName: ['', [Validators.required]],
    businessAddress: ['']
  });

  // App State
  selectedImage = signal<string | null>(null);
  processedImage = signal<string | null>(null);
  isProcessing = signal(false);
  isGeneratingImage = signal(false);
  productDetails = signal<ProductDetails | null>(null);
  activeTab = signal<'details' | 'amazon' | 'flipkart' | 'meesho' | 'instagram'>('details');
  copiedField = signal<string | null>(null);

  constructor() {
    addIcons({ 
      camera, cloudUpload, sparkles, image, list, pricetag, 
      copy, checkmark, logIn, logOut, person, business, 
      call, mail, location 
    });

    onAuthStateChanged(auth, (user: User | null) => {
      this.user.set(user);
      this.isAuthReady.set(true);
      if (user) {
        this.loadProfile(user.uid);
      } else {
        this.sellerProfile.set(null);
      }
    });
  }

  async login() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  }

  async logout() {
    try {
      await signOut(auth);
      this.selectedImage.set(null);
      this.productDetails.set(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  async loadProfile(uid: string) {
    this.isProfileLoading.set(true);
    try {
      const docRef = doc(db, 'sellers', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        this.sellerProfile.set(docSnap.data() as SellerProfile);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      this.isProfileLoading.set(false);
    }
  }

  async registerSeller() {
    const user = this.user();
    if (!user || !this.registrationForm.valid) return;

    const profileData = {
      uid: user.uid,
      email: user.email,
      ...this.registrationForm.value,
      createdAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'sellers', user.uid), profileData);
      this.sellerProfile.set(profileData as any);
    } catch (error) {
      console.error("Registration failed:", error);
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
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
      const details = await this.gemini.extractProductDetails(base64, mimeType);
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
      const newImage = await this.gemini.generateWhiteBackground(base64, mimeType);
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
}
