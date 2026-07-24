import { MarketplaceId } from './marketplace.model';
import { AmazonListing, FlipkartListing, MeeshoListing, InstagramContent } from './marketplace-listing.model';

export interface BasicInformation {
  productName: string;
  shortTitle: string;
  brand: string;
  manufacturer: string;
  importer: string;
  packer: string;
  genericName: string;
  internalProductId: string;
  modelNumber: string;
  sku: string;
  barcode: string;
  upc: string;
  ean: string;
  isbn: string;
  countryOfOrigin: string;
  launchDate: string;
}

export interface Classification {
  category: string;
  subCategory: string;
  productType: string;
  amazonCategory: string;
  flipkartCategory: string;
  meeshoCategory: string;
  googleProductCategory: string;
}

export interface Pricing {
  mrp: number;
  sellingPrice: number;
  costPrice: number;
  discountPercent: number;
  estimatedMarketplaceFee: number;
  shippingCost: number;
  profitMargin: number;
  estimatedProfit: number;
  currency: string;
}

export interface Taxation {
  hsnCode: string;
  gstPercentage: number;
  gstType: string;
  taxInclusive: boolean;
}

export interface Inventory {
  stockQuantity: number;
  minimumStock: number;
  maximumStock: number;
  warehouseLocation: string;
  reorderLevel: number;
  unit: string;
}

export interface PhysicalAttributes {
  material: string;
  color: string;
  pattern: string;
  finish: string;
  size: string;
  weight: string;
  height: string;
  width: string;
  length: string;
  volume: string;
  shape: string;
  packageContents: string;
}

export interface ProductAttributes {
  gender: string;
  ageGroup: string;
  occasion: string;
  style: string;
  season: string;
  collection: string;
  theme: string;
  usage: string;
  careInstructions: string;
  warranty: string;
  expiryDate: string;
  shelfLife: string;
}

export interface ProductImages {
  mainImage: string;
  galleryImages: string[];
  lifestyleImages: string[];
  video: string;
  altText: string;
  seoImageName: string;
  mainImageQuality: string;
  backgroundRemoved: boolean;
  imageSuggestions: string[];
  missingImages: string[];
}

export interface Compliance {
  dangerousGoods: boolean;
  fragile: boolean;
  batteryIncluded: boolean;
  foodLicenseRequired: boolean;
  fssaiRequired: boolean;
  bisRequired: boolean;
  mandatoryAttributesMissing: string[];
}

export interface Confidence {
  overall: number;
  category: number;
  pricing: number;
  hsn: number;
  seo: number;
  description: number;
}

export interface AiInsights {
  seoScore: number;
  readabilityScore: number;
  listingQualityScore: number;
  duplicateContentScore: number;
  keywordDensity: number;
  characterCount: number;
  missingKeywords: string[];
  trendingKeywords: string[];
  aiSuggestions: string[];
  competitorSuggestions: string[];
  expectedSearchVisibility: string;
  estimatedConversionScore: number;
  expectedRanking: string;
  contentSentiment: string;
  marketplaceOptimizationScore: number;
  listingScore: number;
  marketReadiness: number;
  estimatedDemand: string;
  competitionLevel: string;
  recommendedSellingPrice: number;
  recommendedDiscount: number;
  trending: boolean;
  fastMoving: boolean;
  seasonality: string;
  improvementSuggestions: string[];
}

export interface Product {
  id?: string;
  uid?: string;
  basicInformation: BasicInformation;
  classification: Classification;
  pricing: Pricing;
  taxation: Taxation;
  inventory: Inventory;
  physicalAttributes: PhysicalAttributes;
  productAttributes: ProductAttributes;
  images: ProductImages;
  compliance: Compliance;
  confidence: Confidence;
  marketplaceListings: {
    amazon: AmazonListing;
    flipkart: FlipkartListing;
    meesho: MeeshoListing;
  };
  socialContent: InstagramContent;
  aiInsights: AiInsights;
  dynamicAttributes: Partial<Record<MarketplaceId, Record<string, string>>>;
  createdAt?: string;
}
