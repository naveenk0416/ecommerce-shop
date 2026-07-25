import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UiCard } from '../../ui/card/card';
import { UiSection } from '../../ui/section/section';

@Component({
  selector: 'app-ai-insights',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection],
  templateUrl: './ai-insights.html',
  styleUrl: '../tab-shell.scss',
})
export class AiInsights {}
