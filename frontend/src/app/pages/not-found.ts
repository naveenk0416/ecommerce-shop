import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styleUrl: './page.css',
  template: `
    <article class="page" style="text-align: center">
      <p class="page__eyebrow">Error 404</p>
      <h1 class="page__title">Page not found</h1>
      <p>The page you're looking for doesn't exist or has moved.</p>
      <a routerLink="/" class="btn-home">Go to homepage</a>
    </article>
  `,
})
export class NotFound {}

/**
 * Placeholder for paths the App shell renders itself from window.location (reset-password,
 * verify-email, forgot-password) — they need a route so the "**" 404 catch-all doesn't claim them.
 */
@Component({
  selector: 'app-route-stub',
  standalone: true,
  template: '',
})
export class RouteStub {}
