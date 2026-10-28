import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UiCard } from '../card/card';
import { ListingDraftSummary, ListingService } from '../../../../services/listing';

/** How many recent listings the empty-tab picker offers. */
const RECENT_LISTINGS = 5;

/**
 * Shared "not ready yet" panel for AI-generated /optimize tabs: with no product open it offers the
 * seller's most recent listings (and the way to General Details), shows a spinner while generating,
 * or an error with a retry action. Renders nothing (transparent) once the tab has real content.
 */
@Component({
  selector: 'app-ai-tab-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule, UiCard],
  templateUrl: './ai-tab-status.html',
  styleUrl: './ai-tab-status.scss',
})
export class AiTabStatus {
  private readonly listingService = inject(ListingService);

  hasImage = input.required<boolean>();
  isAnalyzing = input(false);
  error = input<string | null>(null);
  analyzingLabel = input('Analyzing image with Gemini AI…');
  /** "Uses 1 coin · 14 left" shown under Retry, when the retry costs coins. */
  retryNote = input<string | null>(null);

  retry = output<void>();

  /** null while loading (or when the list couldn't be loaded — the picker is then simply hidden). */
  readonly recent = signal<ListingDraftSummary[] | null>(null);
  private requested = false;

  constructor() {
    effect(() => {
      if (this.hasImage() || this.requested) return;
      this.requested = true;
      untracked(() => {
        this.listingService
          .listDrafts()
          .then((drafts) => this.recent.set(
            [...drafts].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')).slice(0, RECENT_LISTINGS),
          ))
          .catch(() => this.recent.set([]));
      });
    });
  }
}
