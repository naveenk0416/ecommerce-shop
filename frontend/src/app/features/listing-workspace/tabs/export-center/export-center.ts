import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { UiCard } from '../../ui/card/card';
import { UiSection } from '../../ui/section/section';

interface ExportFormat {
  id: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-export-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, MatButtonModule, MatIconModule],
  templateUrl: './export-center.html',
  styleUrl: '../tab-shell.scss',
})
export class ExportCenter {
  readonly formats: ExportFormat[] = [
    { id: 'csv', label: 'CSV', icon: 'table_chart' },
    { id: 'excel', label: 'Excel', icon: 'grid_on' },
    { id: 'json', label: 'JSON', icon: 'data_object' },
  ];
}
