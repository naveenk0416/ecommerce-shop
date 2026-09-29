import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, output, signal } from '@angular/core';
import { AnalyticsService } from '../services/analytics';
import { ApiError } from '../services/api';
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
 * "📸 Try it now — upload a product photo" in the landing hero: one free AI listing without an
 * account. Shows the Amazon title, 2 bullets, HSN and GST; the rest is blurred behind
 * "Free account बनाएं — पूरी listing देखें और save करें".
 */
@Component({
  selector: 'app-guest-try',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './guest-try.html',
  styleUrl: './guest-try.css',
})
export class GuestTry implements OnDestroy {
  /** Emitted when the visitor wants the full listing (goes to sign-up). */
  readonly signup = output<void>();

  protected readonly i18n = inject(LanguageService);
  private readonly guest = inject(GuestListingService);
  private readonly analytics = inject(AnalyticsService);

  protected readonly t = (en: string, hi: string) => this.i18n.t(en, hi);
  readonly state = signal<'idle' | 'working' | 'done' | 'limit' | 'error'>('idle');
  readonly preview = signal<GuestPreview | null>(null);
  readonly photo = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly seconds = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly progressText = computed(() => {
    const s = this.seconds();
    const step = [...PROGRESS].reverse().find(([at]) => s >= at) ?? PROGRESS[0];
    return this.i18n.t(step[1], step[2]);
  });

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
    this.photo.set(URL.createObjectURL(file));
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
        this.state.set('limit');
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
    const url = this.photo();
    if (url) URL.revokeObjectURL(url);
  }
}
