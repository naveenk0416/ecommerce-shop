import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, inject, output, signal } from '@angular/core';
import { AnalyticsService } from '../services/analytics';
import { ApiError } from '../services/api';
import { FloatingUiService } from '../services/floating-ui';
import { GuestListingService, GuestPreview } from '../services/guest-listing';
import { LanguageService } from '../services/language';

/** Progress lines while the guest listing is generated (seconds → English, Hindi). */
const PROGRESS: readonly [number, string, string][] = [
  [0, 'Reading your photo…', 'आपकी photo पढ़ रहे हैं…'],
  [3, 'Finding the product and its category…', 'Product और category पहचान रहे हैं…'],
  [7, 'Writing the Amazon title and bullet points…', 'Amazon title और bullet points लिख रहे हैं…'],
  [11, 'Finding the HSN code and GST…', 'HSN code और GST निकाल रहे हैं…'],
  [15, 'Almost done…', 'बस हो गया…'],
];

/**
 * "Upload product photo" card in the landing hero: one free AI listing without an account.
 * Shows the Amazon title, 2 bullets, HSN and GST; the rest is blurred behind
 * "Free account बनाएं — पूरी listing देखें और save करें". A returning visitor whose free try is
 * still valid sees their saved preview again.
 */
@Component({
  selector: 'app-guest-try',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './guest-try.html',
  styleUrl: './guest-try.css',
})
export class GuestTry implements AfterViewInit, OnDestroy {
  /** Emitted when the visitor wants the full listing (goes to sign-up). */
  readonly signup = output<void>();

  protected readonly i18n = inject(LanguageService);
  private readonly guest = inject(GuestListingService);
  private readonly analytics = inject(AnalyticsService);
  private readonly floating = inject(FloatingUiService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly t = (en: string, hi: string) => this.i18n.t(en, hi);
  /** 'checking' = finding out whether the free try is still available (saved preview / used / upload). */
  readonly state = signal<'checking' | 'idle' | 'working' | 'done' | 'limit' | 'error'>('checking');
  readonly preview = signal<GuestPreview | null>(null);
  /** The preview was made on an earlier visit (loaded from the saved token). */
  readonly returning = signal(false);
  readonly photo = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly seconds = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private observer: IntersectionObserver | null = null;

  readonly progressText = computed(() => {
    const s = this.seconds();
    const step = [...PROGRESS].reverse().find(([at]) => s >= at) ?? PROGRESS[0];
    return this.i18n.t(step[1], step[2]);
  });

  constructor() {
    void this.init();
  }

  /**
   * On load: a valid saved token shows the saved preview; a browser that already used its free
   * try (expired token, or none) gets the sign-up message; otherwise the upload box. Never an
   * upload box that would fail.
   */
  private async init(): Promise<void> {
    if (this.guest.hasPendingListing() && await this.showSaved()) return;
    const available = await this.guest.canTry();
    if (this.state() === 'checking') this.state.set(available ? 'idle' : 'limit');
  }

  ngAfterViewInit(): void {
    // The WhatsApp button hides on phones while this card is on screen, so it never covers it.
    if (typeof IntersectionObserver === 'undefined') return;
    this.observer = new IntersectionObserver(([entry]) => this.floating.uploadCardInView.set(entry.isIntersecting));
    this.observer.observe(this.host.nativeElement);
  }

  /** Returning visitor: their earlier preview, if the free try is still valid. */
  private async showSaved(force = false): Promise<boolean> {
    const saved = await this.guest.savedPreview();
    // On load, don't replace an upload the visitor already started.
    if (!saved || (!force && (this.state() === 'working' || this.state() === 'idle'))) return false;
    this.preview.set(saved);
    this.returning.set(true);
    this.state.set('done');
    return true;
  }

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      this.state.set('error');
      this.error.set(this.t('Please choose a photo (JPG or PNG).', 'कृपया एक photo चुनें (JPG या PNG)।'));
      return;
    }
    const old = this.photo();
    if (old) URL.revokeObjectURL(old);
    this.photo.set(URL.createObjectURL(file));
    this.returning.set(false);
    this.state.set('working');
    this.error.set(null);
    this.startProgress();
    this.analytics.track('guest_try_start');
    try {
      const preview = await this.guest.tryListing(file);
      this.preview.set(preview);
      this.state.set('done');
      this.analytics.track('guest_try_success');
    } catch (error) {
      const apiError = error as ApiError;
      if ((apiError.data as { code?: string } | undefined)?.code === 'GUEST_LIMIT' || apiError.status === 429) {
        // Free try already used: show the saved listing if there still is one.
        this.photo.set(null);
        if (!(await this.showSaved(true))) this.state.set('limit');
      } else {
        this.state.set('error');
        this.error.set(this.t('The AI couldn’t read this photo. Please try again.', 'AI यह photo नहीं पढ़ पाया। कृपया फिर से try करें।'));
      }
    } finally {
      this.stopProgress();
    }
  }

  goSignup(): void {
    this.analytics.trackGuestSignupClick();
    this.signup.emit();
  }

  private startProgress(): void {
    this.seconds.set(0);
    this.stopProgress();
    const started = Date.now();
    this.timer = setInterval(() => this.seconds.set(Math.floor((Date.now() - started) / 1000)), 500);
  }

  private stopProgress(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  ngOnDestroy(): void {
    this.stopProgress();
    this.observer?.disconnect();
    this.floating.uploadCardInView.set(false);
    const url = this.photo();
    if (url) URL.revokeObjectURL(url);
  }
}
