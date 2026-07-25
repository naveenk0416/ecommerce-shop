import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UiCard } from '../../ui/card/card';
import { UiSection } from '../../ui/section/section';
import { EditableField } from '../../ui/editable-field/editable-field';
import { GENERAL_DETAILS_MOCK_VALUES, GENERAL_DETAILS_SECTIONS, GENERAL_DETAILS_SUGGESTIONS } from './general-details.mock';

@Component({
  selector: 'app-general-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, EditableField],
  templateUrl: './general-details.html',
  styleUrl: '../tab-shell.scss',
})
export class GeneralDetails {
  protected readonly sections = GENERAL_DETAILS_SECTIONS;
  protected readonly fieldValues = GENERAL_DETAILS_MOCK_VALUES;

  protected suggestionsFor(key: string): string[] {
    return GENERAL_DETAILS_SUGGESTIONS[key] ?? [];
  }
}
