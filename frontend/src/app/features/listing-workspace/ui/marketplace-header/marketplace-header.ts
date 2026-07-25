import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-marketplace-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatChipsModule, MatIconModule],
  templateUrl: './marketplace-header.html',
  styleUrl: './marketplace-header.scss',
})
export class MarketplaceHeader {
  productName = input('Untitled Product');
  listingId = input('');
  status = input<'draft' | 'ready' | 'published'>('draft');
}
