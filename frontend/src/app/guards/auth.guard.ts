import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth';

/** Blocks product-details routes (/optimize, /workspace/:listingId) for signed-out users.
 * Waits for AuthService's initial session restore (isAuthReady) before deciding, so a hard
 * refresh on a protected URL doesn't bounce a legitimately logged-in user while their token is
 * still being validated. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.isAuthReady).pipe(
    filter((ready) => ready),
    take(1),
    map(() => !!auth.user() || router.createUrlTree(['/home'])),
  );
};
