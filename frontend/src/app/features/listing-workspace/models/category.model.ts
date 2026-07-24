import { MarketplaceId } from './marketplace.model';

export interface AttributeOption {
  value: string;
  label: string;
}

export interface Attribute {
  id: string;
  label: string;
  type: 'string' | 'array' | 'select';
  options?: AttributeOption[];
  required: boolean;
  marketplaces: MarketplaceId[];
}

export interface Subcategory {
  id: string;
  label: string;
}

export interface Category {
  id: string;
  label: string;
  subCategories: Subcategory[];
}
