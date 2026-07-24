import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { MarketplaceHeader } from './components/marketplace-header/marketplace-header';
import { WorkspaceStateService } from './state/workspace-state.service';

@Component({
  selector: 'app-listing-workspace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, MarketplaceHeader],
  providers: [WorkspaceStateService],
  templateUrl: './listing-workspace.html',
})
export class ListingWorkspace implements OnInit {
  private route = inject(ActivatedRoute);
  workspaceState = inject(WorkspaceStateService);

  ngOnInit() {
    const listingId = this.route.snapshot.paramMap.get('listingId');
    if (listingId) {
      this.workspaceState.load(listingId);
    }
  }
}
