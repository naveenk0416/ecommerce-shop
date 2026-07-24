import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const STORAGE_KEY = 'sellassist_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private platformId = inject(PLATFORM_ID);
  isDark = signal(false);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const dark = stored === 'dark';
      this.isDark.set(dark);
      this.apply(dark);
    }
  }

  toggle() {
    const next = !this.isDark();
    this.isDark.set(next);
    if (isPlatformBrowser(this.platformId)) {
      window.localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    }
    this.apply(next);
  }

  private apply(dark: boolean) {
    if (!isPlatformBrowser(this.platformId)) return;
    document.documentElement.classList.toggle('dark', dark);
  }
}
