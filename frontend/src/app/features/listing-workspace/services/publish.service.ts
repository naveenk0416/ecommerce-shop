import { Injectable } from '@angular/core';
import { MarketplaceId } from '../models/marketplace.model';
import { Product } from '../models/product.model';

export interface PublishResult {
  ok: boolean;
  message: string;
}

/** Real marketplace publish APIs are not built yet — this is the honest extension seam. */
const PUBLISH_ENABLED = false;

@Injectable({ providedIn: 'root' })
export class PublishService {
  async publish(marketplaceId: MarketplaceId, _product: Product): Promise<PublishResult> {
    if (!PUBLISH_ENABLED) {
      return { ok: false, message: `Direct publishing to ${marketplaceId} is coming soon.` };
    }
    return { ok: false, message: 'Not implemented' };
  }

  isPublishEnabled(): boolean {
    return PUBLISH_ENABLED;
  }
}
