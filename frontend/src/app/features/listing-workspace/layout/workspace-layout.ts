import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { map } from 'rxjs';
import { MarketplaceHeader } from '../ui/marketplace-header/marketplace-header';
import { MarketplaceIcon } from '../ui/marketplace-icon/marketplace-icon';
import { WORKSPACE_NAV_ITEMS } from './nav-items';

@Component({
  selector: 'app-workspace-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatTabsModule,
    MatToolbarModule,
    MarketplaceHeader,
    MarketplaceIcon,
  ],
  templateUrl: './workspace-layout.html',
  styleUrl: './workspace-layout.scss',
})
export class WorkspaceLayout {
  navItems = WORKSPACE_NAV_ITEMS;
  sidenavOpen = signal(false);

  isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  listingId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('listingId') ?? '')),
    { initialValue: '' },
  );

  toggleSidenav(): void {
    this.sidenavOpen.update((open) => !open);
  }

  closeSidenavOnHandset(): void {
    if (this.isHandset()) {
      this.sidenavOpen.set(false);
    }
  }
}
