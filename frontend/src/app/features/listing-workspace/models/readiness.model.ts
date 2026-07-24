import { MarketplaceId } from './marketplace.model';

export interface ReadinessCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
}

export interface ReadinessResult {
  marketplaceId: MarketplaceId;
  readinessPercent: number;
  status: 'ready' | 'partial' | 'blocked';
  missingFields: string[];
  mandatoryMissing: string[];
  warnings: string[];
  checks: ReadinessCheck[];
}
