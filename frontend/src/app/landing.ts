import { Component, output, input, ChangeDetectionStrategy, inject } from '@angular/core';
import { LanguageService } from './services/language';
import { CommonModule } from '@angular/common';
import { 
  IonButton, IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { BUSINESS, MARKETING_STATS, SHOW_STATS } from './config/site-config';
import { RouterLink } from '@angular/router';
import { GuestTry } from './landing/guest-try';
import { AnalyticsService } from './services/analytics';
import { LANDING_TEXT, LandingTextKey } from './i18n/landing.i18n';
import { camera, analytics, globe, logoAmazon, logoInstagram, logoTwitter, logoLinkedin, logoFacebook, sparkles, flash, rocket, shieldCheckmark, arrowForward, logoGoogle, image, copy, settings, checkmarkCircle, chevronForward, text, documentText, cash, time, school, statsChart, cube, alertCircle, sync, receipt } from 'ionicons/icons';

@Component({
  selector: 'app-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, RouterLink, GuestTry,
    IonButton, IonIcon
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  login = output<void>();
  /** Emits which button was clicked ('hero' | 'cta') for Lead tracking. */
  getStarted = output<string>();
  goDashboard = output<void>();
  /** "Free account बनाएं — पूरी listing देखें" under the guest-try preview. */
  guestSignup = output<void>();

  isLoggedIn = input<boolean>(false);

  readonly showStats = SHOW_STATS;
  readonly stats = MARKETING_STATS;
  readonly business = BUSINESS;
  readonly currentYear = new Date().getFullYear();

  /** Hero language — shared with the cookie banner and sign-up form (LanguageService). */
  private readonly i18n = inject(LanguageService);
  readonly lang = this.i18n.lang;
  /** Landing text in the current language (i18n/landing.i18n.ts). */
  protected tx(key: LandingTextKey): string {
    return LANDING_TEXT[key][this.lang()];
  }

  /** In-page links — ion-content is its own scroll container, so router fragments don't scroll it. */
  scrollToSection(event: Event, id: string) {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  constructor() {
    inject(AnalyticsService).track('landing_view');
    addIcons({ 
      camera, analytics, globe, logoAmazon, logoInstagram, logoTwitter, logoLinkedin, logoFacebook,
      sparkles, flash, rocket, shieldCheckmark, arrowForward, logoGoogle, image,
      copy, settings, checkmarkCircle, chevronForward, text, documentText, cash, time, school, statsChart,
      cube, alertCircle, sync, receipt
    });
  }
}