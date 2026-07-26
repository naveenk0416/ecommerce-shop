import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { INSTAGRAM_CONTENT_SECTIONS } from '../listing-workspace/tabs/instagram-content/instagram-content.mock';
import { EditableField } from '../listing-workspace/ui/editable-field/editable-field';
import { UiCard } from '../listing-workspace/ui/card/card';
import { UiSection } from '../listing-workspace/ui/section/section';
import { AiTabStatus } from '../listing-workspace/ui/ai-tab-status/ai-tab-status';
import { OptimizeSessionService } from './optimize-session.service';

@Component({
  selector: 'app-optimize-instagram-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, EditableField, AiTabStatus],
  templateUrl: './optimize-instagram-content.html',
  styleUrls: ['../listing-workspace/tabs/tab-shell.scss'],
})
export class OptimizeInstagramContent {
  protected readonly session = inject(OptimizeSessionService);

  protected readonly sections = INSTAGRAM_CONTENT_SECTIONS;

  results = computed(() => this.session.getResult('instagram') ?? null);

  /** Retries the single combined Gemini call covering this tab and every other tab. */
  generate(): void {
    this.session.generateAll();
  }
}
