import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UiCard } from '../card/card';

/**
 * Shared "not ready yet" panel for AI-generated /optimize tabs: prompts for an image when
 * none has been uploaded, shows a spinner while generating, or an error with a retry action.
 * Renders nothing (transparent) once the tab has real content to show instead.
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
  hasImage = input.required<boolean>();
  isAnalyzing = input(false);
  error = input<string | null>(null);
  analyzingLabel = input('Analyzing image with Gemini AI…');

  retry = output<void>();
}
