import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { UiCard } from '../../ui/card/card';
import { UiSection } from '../../ui/section/section';
import { MarketplaceIcon, MarketplaceId } from '../../ui/marketplace-icon/marketplace-icon';

interface PublishRow {
  marketplace: MarketplaceId;
  label: string;
}

@Component({
  selector: 'app-publish-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, MarketplaceIcon, MatButtonModule],
  templateUrl: './publish-center.html',
  styleUrl: '../tab-shell.scss',
})
export class PublishCenter {
  readonly rows: PublishRow[] = [
    { marketplace: 'amazon', label: 'Amazon' },
    { marketplace: 'flipkart', label: 'Flipkart' },
    { marketplace: 'meesho', label: 'Meesho' },
    { marketplace: 'instagram', label: 'Instagram' },
  ];
}
