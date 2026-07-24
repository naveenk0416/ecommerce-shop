import { MarketplaceId } from './marketplace.model';

export interface ExportResult {
  format: 'xlsx' | 'csv' | 'json' | 'pdf';
  marketplaceId?: MarketplaceId;
  blobUrl: string;
  filename: string;
  generatedAt: string;
}
