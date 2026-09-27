import { Component, output, input, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonButton, IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { BUSINESS, MARKETING_STATS, SHOW_STATS } from './config/site-config';
import { RouterLink } from '@angular/router';
import { camera, analytics, globe, logoAmazon, logoInstagram, logoTwitter, logoLinkedin, logoFacebook, sparkles, flash, rocket, shieldCheckmark, arrowForward, logoGoogle, image, copy, settings, checkmarkCircle, chevronForward, text, documentText, cash, time, school, statsChart, cube, alertCircle, sync, receipt } from 'ionicons/icons';

@Component({
  selector: 'app-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, RouterLink,
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

  isLoggedIn = input<boolean>(false);

  readonly showStats = SHOW_STATS;
  readonly stats = MARKETING_STATS;
  readonly business = BUSINESS;
  readonly currentYear = new Date().getFullYear();

  /** Hero language. Hindi by default for ?lang=hi or Hindi ad campaigns (utm_campaign=*hindi*). */
  lang = signal<'en' | 'hi'>(Landing.initialLang());

  private static initialLang(): 'en' | 'hi' {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('lang') === 'hi') return 'hi';
      if (/hindi/i.test(params.get('utm_campaign') || '')) return 'hi';
      const stored = JSON.parse(window.localStorage.getItem('sa_attribution') || 'null') as { utm_campaign?: string } | null;
      if (/hindi/i.test(stored?.utm_campaign || '')) return 'hi';
    } catch {
      // No window/storage — default to English.
    }
    return 'en';
  }

  /** In-page links — ion-content is its own scroll container, so router fragments don't scroll it. */
  scrollToSection(event: Event, id: string) {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  constructor() {
    addIcons({ 
      camera, analytics, globe, logoAmazon, logoInstagram, logoTwitter, logoLinkedin, logoFacebook,
      sparkles, flash, rocket, shieldCheckmark, arrowForward, logoGoogle, image,
      copy, settings, checkmarkCircle, chevronForward, text, documentText, cash, time, school, statsChart,
      cube, alertCircle, sync, receipt
    });
  }
}