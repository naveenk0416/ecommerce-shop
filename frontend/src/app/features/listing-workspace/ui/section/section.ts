import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-ui-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './section.html',
  styleUrl: './section.scss',
})
export class UiSection {
  title = input.required<string>();
  description = input<string>();
  icon = input<string>();
}
