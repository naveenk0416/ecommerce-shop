import { Injectable, inject } from '@angular/core';
import { apiFetch, ApiError } from './api';
import { GeminiService } from './gemini';
import { resizeImage } from '../utils/image';

/** What the landing page shows before sign-up; the full listing stays on the server. */
export interface GuestPreview {
  productTitle: string;
  amazonTitle: string;
  bullets: string[];
  hsnCode: string;
  gst: { rate: number | null; text: string };
}

const GUEST_TOKEN_KEY = 'sa_guest_token';
/** The photo sent to the AI is resized to at most this many pixels on the longest side. */
const GUEST_IMAGE_MAX_PX = 1024;

/**
 * "Try 1 listing free — no sign-up": one AI listing without an account. The token is kept in
 * this browser so the listing can be attached to the account right after sign-up / login.
 */
@Injectable({ providedIn: 'root' })
export class GuestListingService {
  private readonly gemini = inject(GeminiService);

  hasPendingListing(): boolean {
    try {
      return !!window.localStorage.getItem(GUEST_TOKEN_KEY);
    } catch {
      return false;
    }
  }

  /** Resizes the photo (≤1024px) and asks the server for the preview. Throws ApiError (code GUEST_LIMIT when a cap is hit). */
  async tryListing(file: File): Promise<GuestPreview> {
    const original = await readAsDataUrl(file);
    const dataUrl = await resizeImage(original, GUEST_IMAGE_MAX_PX, GUEST_IMAGE_MAX_PX, 0.85).catch(() => original);
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) throw new Error('Could not read this photo. Please try another one.');
    const { prompt, schema } = this.gemini.buildAllListingsRequest();
    const body = await apiFetch<{ token: string; preview: GuestPreview }>('/ai/guest-listing', {
      method: 'POST',
      body: { prompt, schema, image: { data: match[2], mimeType: match[1] } },
    });
    try {
      window.localStorage.setItem(GUEST_TOKEN_KEY, body.token);
    } catch {
      // Storage blocked — the preview still shows; it just can't be saved after sign-up.
    }
    return body.preview;
  }

  /** Whether this browser can still use the free try (same limits the server enforces). */
  async canTry(): Promise<boolean> {
    try {
      const { available } = await apiFetch<{ available: boolean }>('/ai/guest-status');
      return available;
    } catch {
      return true; // Can't tell — let the upload decide (it answers with the sign-up message if not).
    }
  }

  /** A returning visitor's saved preview (token still valid, not yet saved to an account), or null. */
  async savedPreview(): Promise<GuestPreview | null> {
    let token: string | null = null;
    try {
      token = window.localStorage.getItem(GUEST_TOKEN_KEY);
    } catch {
      return null;
    }
    if (!token) return null;
    try {
      const { preview } = await apiFetch<{ preview: GuestPreview }>('/ai/guest-listing/preview', { method: 'POST', body: { token } });
      return preview;
    } catch (error) {
      if ((error as ApiError).status === 404) this.forget();
      return null;
    }
  }

  /**
   * After sign-up / login: attaches the guest listing to the account (free) and returns the new
   * listing's id, or null when there's nothing to attach (or it expired).
   */
  async claimPending(): Promise<string | null> {
    let token: string | null = null;
    try {
      token = window.localStorage.getItem(GUEST_TOKEN_KEY);
    } catch {
      return null;
    }
    if (!token) return null;
    try {
      const { draftId } = await apiFetch<{ draftId: string }>('/ai/guest-listing/claim', { method: 'POST', body: { token } });
      this.forget();
      return draftId;
    } catch (error) {
      const status = (error as ApiError).status;
      // Expired or someone else's: nothing to attach, stop trying.
      if (status === 404 || status === 409 || status === 400) this.forget();
      console.warn('Could not attach the guest listing', error);
      return null;
    }
  }

  private forget(): void {
    try {
      window.localStorage.removeItem(GUEST_TOKEN_KEY);
    } catch {
      // Nothing to clean up.
    }
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read this photo. Please try another one.'));
    reader.readAsDataURL(file);
  });
}
