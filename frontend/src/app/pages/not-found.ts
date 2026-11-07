import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
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
export class NotFound {
  constructor() {
    // The server also answers unknown URLs with status 404 (.htaccess); noindex covers any route
    // that still reaches this view with a 200 (e.g. an unknown /optimize/… child).
    const meta = inject(Meta);
    meta.updateTag({ name: 'robots', content: 'noindex, follow' });
    inject(DestroyRef).onDestroy(() => meta.updateTag({ name: 'robots', content: 'index, follow' }));
  }
}

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
