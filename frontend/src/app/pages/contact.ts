import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BUSINESS, WHATSAPP_NUMBER, WHATSAPP_PREFILL } from '../config/site-config';

@Component({
  selector: 'app-contact',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styleUrl: './page.css',
  template: `
    <article class="page">
      <p class="page__eyebrow">Support</p>
      <h1 class="page__title">Contact us</h1>
      <p>Questions about listings, GST suggestions, billing or your account? We're happy to help.</p>

      <div class="contact-grid">
        <div class="contact-card">
          <div class="contact-card__label">Email</div>
          <div class="contact-card__value"><a [href]="'mailto:' + b.supportEmail">{{ b.supportEmail }}</a></div>
        </div>
        <div class="contact-card">
          <div class="contact-card__label">Phone / WhatsApp</div>
          <div class="contact-card__value">
            @if (whatsappUrl) {
              <a [href]="whatsappUrl" target="_blank" rel="noopener">{{ b.phoneDisplay }}</a>
            } @else {
              {{ b.phoneDisplay }}
            }
          </div>
        </div>
        <div class="contact-card">
          <div class="contact-card__label">Business</div>
          <div class="contact-card__value">{{ b.legalName }}<br />{{ b.address }}</div>
        </div>
        <div class="contact-card">
          <div class="contact-card__label">Grievance Officer</div>
          <div class="contact-card__value">
            {{ b.grievanceOfficerName }}<br />
            <a [href]="'mailto:' + b.grievanceOfficerEmail">{{ b.grievanceOfficerEmail }}</a>
          </div>
        </div>
      </div>

      <p class="page__notice">
        For refunds, include your Razorpay payment ID — see our <a routerLink="/refund-policy">Refund Policy</a>.
        For data requests, see our <a routerLink="/privacy">Privacy Policy</a>.
      </p>
    </article>
  `,
})
export class Contact {
  readonly b = BUSINESS;
  readonly whatsappUrl = WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_PREFILL)}`
    : '';
}
