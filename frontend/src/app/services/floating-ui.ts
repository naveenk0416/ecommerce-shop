import { Injectable, signal } from '@angular/core';

/** Lets the floating WhatsApp button step aside while the landing upload card is on screen. */
@Injectable({ providedIn: 'root' })
export class FloatingUiService {
  readonly uploadCardInView = signal(false);
}
