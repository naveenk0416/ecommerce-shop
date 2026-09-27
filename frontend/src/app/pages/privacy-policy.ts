import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BUSINESS, LEGAL_LAST_UPDATED } from '../config/site-config';

// DRAFT — this policy must be reviewed by a lawyer/CA before it is relied on. It is written to
// reflect how the app actually handles data today (see the "What we collect" and "Who we share
// it with" sections); update it whenever a new data flow or third-party provider is added.
@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styleUrl: './page.css',
  template: `
    <article class="page">
      <p class="page__eyebrow">Legal</p>
      <h1 class="page__title">Privacy Policy</h1>
      <span class="page__updated">Last updated: {{ lastUpdated }}</span>

      <p>
        This Privacy Policy explains how {{ b.legalName }} ("{{ b.brandName }}", "we", "us") collects, uses, stores and
        shares your personal data when you use {{ b.websiteUrl }} and the {{ b.brandName }} app (the "Service"). We process
        personal data in accordance with the Digital Personal Data Protection Act, 2023 ("DPDP Act") and other
        applicable Indian law. By creating an account you give consent to the processing described here.
      </p>

      <h2>1. Who is responsible for your data</h2>
      <p>
        {{ b.legalName }}, {{ b.address }}, is the Data Fiduciary for personal data processed through the Service.
        Contact: <a [href]="'mailto:' + b.supportEmail">{{ b.supportEmail }}</a>.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> name, email address, mobile number, password (stored only as a one-way hash), state and city, the marketplaces you sell on, and your GST number (optional).</li>
        <li><strong>WhatsApp preference:</strong> whether you agreed to receive updates and stock alerts on WhatsApp, and when you gave or changed that choice.</li>
        <li><strong>Product content:</strong> product photos you upload and the listing text, HSN codes, GST rates, prices and other details generated or edited in the Service.</li>
        <li><strong>Business data:</strong> inventory quantities, cost and selling prices, and sales you record.</li>
        <li><strong>Marketplace connections:</strong> if you connect Amazon or Flipkart, the access tokens and seller identifiers needed to read and update your listings on your behalf.</li>
        <li><strong>Payments:</strong> order and payment IDs and payment status. Card, UPI and bank details are entered on Razorpay's checkout and are not stored by us.</li>
        <li><strong>Usage and device data:</strong> pages visited, clicks, browser and device type, IP address, and the campaign that brought you to our site (for example UTM parameters and Facebook click IDs).</li>
      </ul>

      <h2>3. Why we use it</h2>
      <ul>
        <li>To create and secure your account, verify your email and let you sign in.</li>
        <li>To generate marketplace listings, HSN/GST suggestions and captions from your product photos.</li>
        <li>To run inventory, sales and marketplace-sync features you choose to use.</li>
        <li>To process payments and keep records required by tax and accounting law.</li>
        <li>To provide support, send service messages (for example verification and password-reset emails) and respond to grievances.</li>
        <li>To contact you about your account and support requests using your mobile number. We send updates and stock alerts on WhatsApp <strong>only if you opt in</strong> — giving us your number alone is not consent, and you can opt out at any time by emailing us.</li>
        <li>To measure and improve our website and advertising, including understanding which campaigns lead to sign-ups.</li>
        <li>To prevent fraud and abuse and comply with legal obligations.</li>
      </ul>

      <h2>4. Who we share it with</h2>
      <p>We do not sell your personal data. We share it only with service providers who process it for us, and only as needed:</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Provider</th><th>Purpose</th><th>Data involved</th></tr>
          </thead>
          <tbody>
            <tr><td>Google (Gemini API)</td><td>AI provider that analyses product photos and generates listing content</td><td>Product photos, product details</td></tr>
            <tr><td>Google Analytics &amp; Google Tag Manager</td><td>Website analytics</td><td>Usage and device data, cookies</td></tr>
            <tr><td>Meta (Meta Pixel)</td><td>Measuring Facebook/Instagram ad performance</td><td>Page views, sign-up events, device data, cookies</td></tr>
            <tr><td>Razorpay</td><td>Payment processing</td><td>Name, email, payment details you enter at checkout</td></tr>
            <tr><td>Email delivery provider</td><td>Verification and account emails</td><td>Name, email address</td></tr>
            <tr><td>Hosting and database providers</td><td>Running the Service and storing data</td><td>All data stored in the Service</td></tr>
            <tr><td>Amazon / Flipkart (only if you connect them)</td><td>Syncing listings, prices and stock you choose to publish</td><td>Listing, price and inventory data</td></tr>
          </tbody>
        </table>
      </div>
      <p>We may also disclose data where required by law, court order or a government authority.</p>
      <p>Some providers may process data outside India. Where they do, we rely on the transfer being permitted under the DPDP Act.</p>

      <h2>5. Cookies and tracking</h2>
      <p>
        We use cookies and similar technologies for sign-in, analytics (Google Analytics) and advertising measurement (Meta
        Pixel). On your first visit we ask for your choice: the Meta Pixel is loaded only if you click "Accept", and Google
        Analytics runs in a cookieless, consent-denied mode until then. If you decline, we remember that choice. To change
        it later, clear this site's data in your browser and choose again. You can also block or delete cookies in your
        browser settings; the Service will still work, but you may need to sign in again.
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>Account, product and business data: for as long as your account is active. After you ask us to delete your account, we delete or anonymise it within 30 days.</li>
        <li>Payment and invoice records: for the period required by Indian tax and accounting laws.</li>
        <li>Analytics data: according to the retention settings of Google Analytics and Meta.</li>
        <li>Unverified accounts may be deleted after a period of inactivity.</li>
      </ul>

      <h2>7. Your rights</h2>
      <p>Under the DPDP Act you can:</p>
      <ul>
        <li>ask for a summary of the personal data we hold about you and how it is processed;</li>
        <li>ask us to correct, complete, update or erase your personal data;</li>
        <li>withdraw your consent at any time (this may mean we can no longer provide the Service);</li>
        <li>nominate another person to exercise your rights in case of death or incapacity;</li>
        <li>raise a grievance with us, and if unresolved, complain to the Data Protection Board of India.</li>
      </ul>
      <p>To exercise these rights, email <a [href]="'mailto:' + b.supportEmail">{{ b.supportEmail }}</a> from your registered email address.</p>

      <h2>8. Security</h2>
      <p>
        We use encryption in transit (HTTPS), hashed passwords, access controls and reputable infrastructure providers to
        protect your data. No system is completely secure; if a personal data breach affects you, we will notify you and
        the Data Protection Board as required by law.
      </p>

      <h2>9. Children</h2>
      <p>The Service is meant for businesses and is not intended for anyone under 18. We do not knowingly collect data from children.</p>

      <h2>10. Grievance Officer</h2>
      <p>
        <strong>{{ b.grievanceOfficerName }}</strong><br />
        Email: <a [href]="'mailto:' + b.grievanceOfficerEmail">{{ b.grievanceOfficerEmail }}</a><br />
        Address: {{ b.address }}
      </p>
      <p>We acknowledge grievances promptly and aim to resolve them within the time limits set by applicable law.</p>

      <h2>11. Changes to this policy</h2>
      <p>We may update this policy. We will change the "Last updated" date above and, for significant changes, notify you by email or in the app.</p>

      <p class="page__notice">
        See also our <a routerLink="/terms">Terms of Service</a>, <a routerLink="/refund-policy">Refund Policy</a> and
        <a routerLink="/contact">Contact</a> page.
      </p>
    </article>
  `,
})
export class PrivacyPolicy {
  readonly b = BUSINESS;
  readonly lastUpdated = LEGAL_LAST_UPDATED;
}
