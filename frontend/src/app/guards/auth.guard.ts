import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth';

/** Where signed-in users land when they don't have a specific destination. */
export const DASHBOARD_PATH = '/optimize';

/**
 * Only internal app paths are allowed as a post-login destination — never an external or
 * protocol-relative URL ("//evil.com", "/\\evil.com") and never the auth pages themselves.
 */
export function safeReturnUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\/(?![/\\])/.test(value)) return null;
  if (/^\/(login|signup|register)(?:[/?#]|$)/.test(value)) return null;
  return value;
}

/** Waits for AuthService's initial session restore (isAuthReady) so a hard refresh on a guarded
 * URL doesn't bounce a legitimately logged-in user while their token is still being validated. */
function whenAuthReady() {
  const auth = inject(AuthService);
  return toObservable(auth.isAuthReady).pipe(filter((ready) => ready), take(1), map(() => auth));
}

/** Protected pages: signed-out users go to /login?returnUrl=<the page they asked for>. */
export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return whenAuthReady().pipe(
    map((auth) => !!auth.user() || router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })),
  );
};

/** /login and /signup: signed-in users go straight to their destination or the dashboard. */
export const guestGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  return whenAuthReady().pipe(
    map((auth) => !auth.user() || router.parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl')) ?? DASHBOARD_PATH)),
  );
};
