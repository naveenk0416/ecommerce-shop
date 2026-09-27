import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BUSINESS, LEGAL_LAST_UPDATED } from '../config/site-config';

// DRAFT — these terms must be reviewed by a lawyer/CA before they are relied on.
@Component({
  selector: 'app-terms',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styleUrl: './page.css',
  template: `
    <article class="page">
      <p class="page__eyebrow">Legal</p>
      <h1 class="page__title">Terms of Service</h1>
      <span class="page__updated">Last updated: {{ lastUpdated }}</span>

      <p>
        These Terms govern your use of {{ b.websiteUrl }} and the {{ b.brandName }} app (the "Service"), operated by
        {{ b.legalName }}, {{ b.address }} ("we", "us"). By creating an account or using the Service you agree to these
        Terms and to our <a routerLink="/privacy">Privacy Policy</a>.
      </p>

      <h2>1. Eligibility and accounts</h2>
      <ul>
        <li>You must be at least 18 and able to enter into a binding contract under Indian law.</li>
        <li>You are responsible for the accuracy of the details you provide and for keeping your password secure.</li>
        <li>You are responsible for all activity under your account. Tell us immediately if you suspect unauthorised use.</li>
      </ul>

      <h2>2. The Service</h2>
      <p>
        {{ b.brandName }} helps online sellers create marketplace listings from product photos, suggests HSN codes and GST
        rates, and provides inventory, sales and marketplace-sync tools. Features may change over time.
      </p>

      <h2>3. AI-generated content and GST/HSN suggestions</h2>
      <ul>
        <li>Listing text, HSN codes, GST rates, prices and other suggestions are generated automatically and may be inaccurate or incomplete.</li>
        <li><strong>They are not tax, legal or professional advice.</strong> You are solely responsible for checking every listing and for the correct classification, tax rate, invoicing and GST compliance of your products. Please confirm with a qualified CA where in doubt.</li>
        <li>You are responsible for making sure your listings comply with the policies of each marketplace you sell on.</li>
      </ul>

      <h2>4. Your content</h2>
      <ul>
        <li>You keep ownership of the photos and data you upload. You give us a limited licence to store and process them to provide the Service.</li>
        <li>You confirm you have the right to upload the content and that it does not infringe anyone's rights or break any law.</li>
        <li>You must not upload content that is unlawful, misleading, or relates to prohibited or restricted products.</li>
      </ul>

      <h2>5. Marketplace connections</h2>
      <p>
        If you connect a marketplace account (such as Amazon or Flipkart), you authorise us to read and update your listings,
        prices and stock on your instructions. You can disconnect at any time from Settings. We are not responsible for
        actions taken by the marketplace, including listing suppression or account restrictions.
      </p>

      <h2>6. Plans, payments and refunds</h2>
      <p>
        Some features require a paid plan. Prices are shown in Indian Rupees and include applicable taxes unless stated
        otherwise. Payments are processed by Razorpay. Cancellations and refunds are governed by our
        <a routerLink="/refund-policy">Refund Policy</a>.
      </p>

      <h2>7. Acceptable use</h2>
      <p>You must not misuse the Service, including by:</p>
      <ul>
        <li>attempting to access other users' data or our systems without permission;</li>
        <li>reverse engineering, scraping or overloading the Service, or bypassing usage limits;</li>
        <li>reselling the Service without our written permission;</li>
        <li>using the Service for any unlawful or fraudulent purpose.</li>
      </ul>

      <h2>8. Suspension and termination</h2>
      <p>
        You can stop using the Service and ask us to delete your account at any time. We may suspend or terminate accounts
        that breach these Terms or where required by law, with notice where reasonably possible.
      </p>

      <h2>9. Disclaimers and limitation of liability</h2>
      <p>
        The Service is provided "as is" and "as available". To the maximum extent permitted by law, we are not liable for
        indirect or consequential losses, lost profits or sales, marketplace penalties, or tax liabilities arising from
        your use of the Service or of AI-generated suggestions. Our total liability for any claim is limited to the amount
        you paid us in the 3 months before the claim.
      </p>

      <h2>10. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of India. Courts at {{ b.jurisdictionCity }} will have exclusive jurisdiction,
        subject to any rights you have under consumer protection law.
      </p>

      <h2>11. Changes</h2>
      <p>We may update these Terms. We will change the "Last updated" date above and notify you of significant changes.</p>

      <h2>12. Contact</h2>
      <p>
        Questions about these Terms: <a [href]="'mailto:' + b.supportEmail">{{ b.supportEmail }}</a>.
        Grievances: {{ b.grievanceOfficerName }}, <a [href]="'mailto:' + b.grievanceOfficerEmail">{{ b.grievanceOfficerEmail }}</a>.
      </p>
    </article>
  `,
})
export class Terms {
  readonly b = BUSINESS;
  readonly lastUpdated = LEGAL_LAST_UPDATED;
}
