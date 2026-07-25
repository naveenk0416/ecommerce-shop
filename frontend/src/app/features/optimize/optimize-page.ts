import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { GENERAL_DETAILS_SECTIONS } from '../listing-workspace/tabs/general-details/general-details.mock';
import { EditableField } from '../listing-workspace/ui/editable-field/editable-field';
import { UiCard } from '../listing-workspace/ui/card/card';
import { UiSection } from '../listing-workspace/ui/section/section';
import { GeminiService } from '../../services/gemini';

@Component({
  selector: 'app-optimize-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatToolbarModule, UiCard, UiSection, EditableField],
  templateUrl: './optimize-page.html',
  styleUrls: ['../listing-workspace/tabs/tab-shell.scss', './optimize-page.scss'],
})
export class OptimizePage {
  private readonly gemini = inject(GeminiService);

  protected readonly sections = GENERAL_DETAILS_SECTIONS;

  imagePreview = signal<string | null>(null);
  isAnalyzing = signal(false);
  error = signal<string | null>(null);
  results = signal<Record<string, string[]> | null>(null);

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.analyze(file);
  }

  reset(): void {
    this.imagePreview.set(null);
    this.results.set(null);
    this.error.set(null);
  }

  private analyze(file: File): void {
    this.error.set(null);
    this.results.set(null);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.imagePreview.set(dataUrl);
      const base64 = dataUrl.split(',')[1] ?? '';

      this.isAnalyzing.set(true);
      this.gemini
        .extractGeneralDetails(base64, file.type)
        .then((data) => this.results.set(data))
        .catch((err) => this.error.set(err instanceof Error ? err.message : 'Failed to analyze image.'))
        .finally(() => this.isAnalyzing.set(false));
    };
    reader.onerror = () => this.error.set('Failed to read the selected file.');
    reader.readAsDataURL(file);
  }
}
