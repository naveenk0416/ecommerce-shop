import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UiCard } from '../../ui/card/card';
import { UiSection } from '../../ui/section/section';
import { MarketplaceIcon, MarketplaceId } from '../../ui/marketplace-icon/marketplace-icon';

interface ReadinessRow {
  marketplace: MarketplaceId;
  label: string;
}

@Component({
  selector: 'app-marketplace-readiness',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, MarketplaceIcon],
  templateUrl: './marketplace-readiness.html',
  styleUrl: '../tab-shell.scss',
})
export class MarketplaceReadiness {
  readonly rows: ReadinessRow[] = [
    { marketplace: 'amazon', label: 'Amazon' },
    { marketplace: 'flipkart', label: 'Flipkart' },
    { marketplace: 'meesho', label: 'Meesho' },
    { marketplace: 'instagram', label: 'Instagram' },
  ];
}
