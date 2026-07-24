import { Attribute } from '../models/category.model';
import { MarketplaceId } from '../models/marketplace.model';

export interface CategoryAttributeSet {
  category: string;
  subCategory: string;
  marketplaces: MarketplaceId[];
  attributes: Attribute[];
}

export const CATEGORY_ATTRIBUTES: CategoryAttributeSet[] = [
  {
    category: 'Jewellery',
    subCategory: 'Necklaces',
    marketplaces: ['flipkart', 'meesho'],
    attributes: [
      { id: 'stone', label: 'Stone', type: 'string', required: false, marketplaces: ['flipkart', 'meesho'] },
      { id: 'finish', label: 'Finish', type: 'select', required: true, marketplaces: ['flipkart', 'meesho'],
        options: [
          { value: 'gold-plated', label: 'Gold Plated' },
          { value: 'silver-plated', label: 'Silver Plated' },
          { value: 'antique', label: 'Antique' },
          { value: 'rose-gold', label: 'Rose Gold' },
        ] },
      { id: 'occasion', label: 'Occasion', type: 'string', required: false, marketplaces: ['flipkart', 'meesho'] },
      { id: 'closureType', label: 'Closure Type', type: 'string', required: false, marketplaces: ['flipkart', 'meesho'] },
      { id: 'color', label: 'Color', type: 'string', required: true, marketplaces: ['flipkart', 'meesho'] },
    ],
  },
  {
    category: 'Footwear',
    subCategory: 'Sneakers',
    marketplaces: ['flipkart', 'meesho'],
    attributes: [
      { id: 'upperMaterial', label: 'Upper Material', type: 'string', required: true, marketplaces: ['flipkart', 'meesho'] },
      { id: 'heelHeight', label: 'Heel Height', type: 'string', required: false, marketplaces: ['flipkart', 'meesho'] },
      { id: 'toeShape', label: 'Toe Shape', type: 'string', required: false, marketplaces: ['flipkart', 'meesho'] },
      { id: 'closureType', label: 'Closure Type', type: 'select', required: false, marketplaces: ['flipkart', 'meesho'],
        options: [
          { value: 'lace-up', label: 'Lace-Up' },
          { value: 'slip-on', label: 'Slip-On' },
          { value: 'velcro', label: 'Velcro' },
        ] },
    ],
  },
  {
    category: 'Apparel',
    subCategory: 'T-Shirts',
    marketplaces: ['flipkart', 'meesho'],
    attributes: [
      { id: 'fabric', label: 'Fabric', type: 'string', required: true, marketplaces: ['flipkart', 'meesho'] },
      { id: 'pattern', label: 'Pattern', type: 'string', required: false, marketplaces: ['flipkart', 'meesho'] },
      { id: 'fit', label: 'Fit', type: 'select', required: true, marketplaces: ['flipkart', 'meesho'],
        options: [
          { value: 'regular', label: 'Regular Fit' },
          { value: 'slim', label: 'Slim Fit' },
          { value: 'oversized', label: 'Oversized' },
        ] },
      { id: 'sleeve', label: 'Sleeve', type: 'string', required: false, marketplaces: ['flipkart', 'meesho'] },
      { id: 'neck', label: 'Neck', type: 'string', required: false, marketplaces: ['flipkart', 'meesho'] },
    ],
  },
  {
    category: 'Electronics',
    subCategory: 'Smartphones',
    marketplaces: ['flipkart', 'meesho'],
    attributes: [
      { id: 'ram', label: 'RAM', type: 'string', required: true, marketplaces: ['flipkart', 'meesho'] },
      { id: 'storage', label: 'Storage', type: 'string', required: true, marketplaces: ['flipkart', 'meesho'] },
      { id: 'processor', label: 'Processor', type: 'string', required: false, marketplaces: ['flipkart', 'meesho'] },
      { id: 'battery', label: 'Battery', type: 'string', required: false, marketplaces: ['flipkart', 'meesho'] },
      { id: 'display', label: 'Display', type: 'string', required: false, marketplaces: ['flipkart', 'meesho'] },
    ],
  },
];
