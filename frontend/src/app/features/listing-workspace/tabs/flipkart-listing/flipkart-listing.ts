import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UiCard } from '../../ui/card/card';
import { UiSection } from '../../ui/section/section';
import { EditableField } from '../../ui/editable-field/editable-field';

@Component({
  selector: 'app-flipkart-listing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, EditableField],
  templateUrl: './flipkart-listing.html',
  styleUrl: '../tab-shell.scss',
})
export class FlipkartListing {}
