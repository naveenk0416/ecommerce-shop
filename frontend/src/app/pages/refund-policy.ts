import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BUSINESS, LEGAL_LAST_UPDATED } from '../config/site-config';

// DRAFT — this policy must be reviewed by a lawyer/CA before it is relied on. It describes the
// current Pro plan (₹299/month, paid per month through Razorpay, no automatic renewal); update it
// if pricing, credits or auto-renewing subscriptions are introduced.
@Component({
  selector: 'app-refund-policy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styleUrl: './page.css',
  template: `
    <article class="page">
      <p class="page__eyebrow">Legal</p>
      <h1 class="page__title">Cancellation &amp; Refund Policy</h1>
      <span class="page__updated">Last updated: {{ lastUpdated }}</span>

      <p>
        This policy applies to payments made to {{ b.legalName }} ("{{ b.brandName }}") for paid plans on {{ b.websiteUrl }}.
        All payments are processed securely by Razorpay.
      </p>

      <h2>1. Plans and billing</h2>
      <ul>
        <li>{{ b.brandName }} has a free plan and a paid Pro plan. The Pro plan is priced at ₹299 per month (price shown at checkout is final and includes applicable taxes unless stated otherwise).</li>
        <li>Each payment covers one month of Pro access from the date of payment. Plans do not renew automatically — you pay again to continue.</li>
        <li>If we introduce credit packs or auto-renewing subscriptions, the checkout page and this policy will state the terms before you pay.</li>
      </ul>

      <h2>2. Cancellation</h2>
      <ul>
        <li>You can stop using the Pro plan at any time. Because plans do not auto-renew, no further charge is made.</li>
        <li>After cancellation or expiry, Pro features stay available until the end of the paid month, then your account moves to the free plan. Your saved data is not deleted.</li>
      </ul>

      <h2>3. Refunds</h2>
      <ul>
        <li><strong>First purchase:</strong> if you are not satisfied, you can request a full refund within 7 days of your first Pro payment.</li>
        <li><strong>Failed, duplicate or excess charges:</strong> refunded in full once verified.</li>
        <li><strong>Service unavailable:</strong> if a significant outage on our side prevents you from using paid features, we will refund or extend your plan on a pro-rata basis.</li>
        <li>Except as above, payments for a month that has already started are not refundable.</li>
      </ul>

      <h2>4. How to request a refund</h2>
      <p>
        Email <a [href]="'mailto:' + b.supportEmail">{{ b.supportEmail }}</a> from your registered email address with your
        Razorpay payment ID (from the payment confirmation email) and the reason for the request. We will reply within 2
        business days.
      </p>

      <h2>5. Refund timelines</h2>
      <ul>
        <li>Approved refunds are initiated within 5 business days of approval.</li>
        <li>Refunds go back to the original payment method. After we initiate a refund, banks and card issuers usually take 5–7 business days to credit it (UPI refunds are often faster).</li>
        <li>If you have not received an approved refund after 10 business days, contact us with the refund reference and we will follow up with Razorpay.</li>
      </ul>

      <h2>6. Contact</h2>
      <p>
        {{ b.legalName }}, {{ b.address }}<br />
        Email: <a [href]="'mailto:' + b.supportEmail">{{ b.supportEmail }}</a> · Phone/WhatsApp: {{ b.phoneDisplay }}
      </p>

      <p class="page__notice">
        See also our <a routerLink="/terms">Terms of Service</a> and <a routerLink="/privacy">Privacy Policy</a>.
      </p>
    </article>
  `,
})
export class RefundPolicy {
  readonly b = BUSINESS;
  readonly lastUpdated = LEGAL_LAST_UPDATED;
}
