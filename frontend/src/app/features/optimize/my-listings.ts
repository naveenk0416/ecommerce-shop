import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, inject, runInInjectionContext, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LanguageService } from '../../services/language';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UiCard } from '../listing-workspace/ui/card/card';
import { ListingDraftSummary, ListingService } from '../../services/listing';

/** "My Listings" — every AI listing, auto-saved as a draft, newest first. */
@Component({
  selector: 'app-my-listings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatIconModule, MatTooltipModule, UiCard, RouterLink],
  template: `
    <app-ui-card [elevated]="true">
      <div class="my-listings">
        <div class="my-listings__header">
          <div>
            <h2 class="my-listings__title">My Listings</h2>
            <p class="my-listings__subtitle">Every listing you generate is saved here automatically — open it to keep editing, copy it for a similar product, or delete it.</p>
          </div>
          <div class="my-listings__actions">
            <a mat-stroked-button routerLink="/optimize/bulk-upload" data-testid="bulk-upload-link">
              <mat-icon aria-hidden="true">table_view</mat-icon>
              {{ i18n.t('Bulk upload file', 'Bulk upload file') }}
            </a>
            <button mat-flat-button color="primary" (click)="newListing()">
              <mat-icon aria-hidden="true">add_a_photo</mat-icon>
              New listing
            </button>
          </div>
        </div>

        @if (loading()) {
          <p class="my-listings__empty" role="status">Loading your listings…</p>
        } @else if (error()) {
          <p class="my-listings__empty my-listings__empty--error" role="alert">{{ error() }}</p>
        } @else if (drafts().length === 0) {
          <p class="my-listings__empty">No listings yet — upload a product photo to create your first one.</p>
        } @else {
          <ul class="my-listings__list">
            @for (draft of drafts(); track draft.id) {
              <li class="listing-row">
                <button type="button" class="listing-row__main" (click)="open(draft)" [attr.aria-label]="'Open ' + (draft.title || 'Untitled product')">
                  @if (draft.imageUrl) {
                    <img [src]="draft.imageUrl" alt="" class="listing-row__image" loading="lazy" />
                  } @else {
                    <span class="listing-row__image listing-row__image--empty"><mat-icon aria-hidden="true">image</mat-icon></span>
                  }
                  <span class="listing-row__info">
                    <span class="listing-row__name">{{ draft.title || 'Untitled product' }}</span>
                    <span class="listing-row__meta">
                      <span class="status" [class.status--saved]="draft.status === 'saved'">{{ draft.status === 'saved' ? 'In inventory' : 'Draft' }}</span>
                      Updated {{ draft.updatedAt | date: 'd MMM y, h:mm a' }}
                    </span>
                  </span>
                </button>
                <div class="listing-row__actions">
                  <button mat-icon-button (click)="open(draft)" matTooltip="Open" [attr.aria-label]="'Open ' + (draft.title || 'Untitled product')"><mat-icon>edit_note</mat-icon></button>
                  <button mat-icon-button (click)="duplicate(draft)" [disabled]="busyId() === draft.id" matTooltip="Duplicate" [attr.aria-label]="'Duplicate ' + (draft.title || 'Untitled product')"><mat-icon>content_copy</mat-icon></button>
                  <button mat-icon-button (click)="remove(draft)" [disabled]="busyId() === draft.id" matTooltip="Delete" [attr.aria-label]="'Delete ' + (draft.title || 'Untitled product')"><mat-icon>delete</mat-icon></button>
                </div>
              </li>
            }
          </ul>
        }
      </div>
    </app-ui-card>
  `,
  styles: `
    .my-listings { display: flex; flex-direction: column; gap: 16px; }
    .my-listings__header { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
    .my-listings__actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .my-listings__title { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
    .my-listings__subtitle { margin: 4px 0 0; font-size: 13px; color: #64748b; max-width: 560px; }
    .my-listings__empty { margin: 0; padding: 24px 0; text-align: center; color: #64748b; }
    .my-listings__empty--error { color: #b91c1c; }
    .my-listings__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .listing-row { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid #f1f5f9; border-radius: 14px; }
    .listing-row__main { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 12px; background: none; border: 0; padding: 0; text-align: left; cursor: pointer; }
    .listing-row__image { width: 56px; height: 56px; flex-shrink: 0; border-radius: 10px; object-fit: cover; background: #f1f5f9; }
    .listing-row__image--empty { display: flex; align-items: center; justify-content: center; color: #94a3b8; }
    .listing-row__info { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .listing-row__name { font-weight: 700; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .listing-row__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: #64748b; }
    .listing-row__actions { display: flex; flex-shrink: 0; }
    .status { padding: 2px 8px; border-radius: 999px; background: #fef3c7; color: #b45309; font-weight: 700; font-size: 11px; }
    .status--saved { background: #dcfce7; color: #15803d; }
    @media (max-width: 480px) {
      .listing-row { flex-wrap: wrap; }
      .listing-row__actions { width: 100%; justify-content: flex-end; }
    }
  `,
})
export class MyListings {
  private readonly listingService = inject(ListingService);
  protected readonly i18n = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  drafts = signal<ListingDraftSummary[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  busyId = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private get snackBar(): MatSnackBar {
    return runInInjectionContext(this.injector, () => inject(MatSnackBar));
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.drafts.set(await this.listingService.listDrafts());
    } catch (error) {
      this.error.set((error instanceof Error && error.message) || 'Could not load your listings.');
    } finally {
      this.loading.set(false);
    }
  }

  open(draft: ListingDraftSummary): void {
    this.router.navigate(['/optimize/general'], { queryParams: { id: draft.id } });
  }

  newListing(): void {
    this.router.navigate(['/optimize/general']);
  }

  async duplicate(draft: ListingDraftSummary): Promise<void> {
    this.busyId.set(draft.id);
    try {
      const copy = await this.listingService.duplicateDraft(draft.id);
      this.drafts.update((list) => [copy, ...list]);
      this.snackBar.open(`Duplicated as "${copy.title}".`, 'Dismiss', { duration: 3000 });
    } catch (error) {
      this.snackBar.open((error instanceof Error && error.message) || 'Could not duplicate this listing.', 'Dismiss', { duration: 4000 });
    } finally {
      this.busyId.set(null);
    }
  }

  async remove(draft: ListingDraftSummary): Promise<void> {
    const note = draft.status === 'saved' ? ' The inventory item stays, but it will no longer open this full listing.' : '';
    if (!confirm(`Delete "${draft.title || 'Untitled product'}" from My Listings?${note}`)) return;
    this.busyId.set(draft.id);
    try {
      await this.listingService.deleteDraft(draft.id);
      this.drafts.update((list) => list.filter((d) => d.id !== draft.id));
      this.snackBar.open('Listing deleted.', 'Dismiss', { duration: 3000 });
    } catch (error) {
      this.snackBar.open((error instanceof Error && error.message) || 'Could not delete this listing.', 'Dismiss', { duration: 4000 });
    } finally {
      this.busyId.set(null);
    }
  }
}
