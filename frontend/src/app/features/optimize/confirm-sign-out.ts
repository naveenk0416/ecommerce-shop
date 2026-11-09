import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type { ConfirmActionData } from './confirm-action-dialog';
import type { LanguageService } from '../../services/language';

/** "Sign out?" confirmation, shared by the header menu and Profile. Resolves true to sign out. */
export async function confirmSignOut(dialog: MatDialog, i18n: LanguageService): Promise<boolean> {
  const { ConfirmActionDialog } = await import('./confirm-action-dialog');
  const data: ConfirmActionData = {
    title: i18n.t('Sign out?', 'Logout करें?'),
    intro: i18n.t('You will need to sign in again to see your listings and inventory.', 'Listings और inventory देखने के लिए फिर से login करना होगा।'),
    items: [],
    confirmLabel: i18n.t('Sign out', 'Logout करें'),
  };
  const ok = await firstValueFrom(dialog.open(ConfirmActionDialog, { data, width: '420px', maxWidth: '95vw' }).afterClosed());
  return !!ok;
}
