import { Injectable } from '@angular/core';
import { Product } from '../models/product.model';
import { ReadinessCheck, ReadinessResult } from '../models/readiness.model';
import { MarketplaceId } from '../models/marketplace.model';

function toResult(marketplaceId: MarketplaceId, checks: ReadinessCheck[]): ReadinessResult {
  const total = checks.length;
  const passed = checks.filter(c => c.passed).length;
  const readinessPercent = total === 0 ? 100 : Math.round((passed / total) * 100);
  const mandatoryMissing = checks.filter(c => !c.passed && c.severity === 'error').map(c => c.label);
  const warnings = checks.filter(c => !c.passed && c.severity === 'warning').map(c => c.label);
  const status: ReadinessResult['status'] = mandatoryMissing.length > 0 ? 'blocked' : warnings.length > 0 ? 'partial' : 'ready';

  return {
    marketplaceId,
    readinessPercent,
    status,
    missingFields: [...mandatoryMissing, ...warnings],
    mandatoryMissing,
    warnings,
    checks,
  };
}

/**
 * Pure deterministic validation — no AI call. Given the product + marketplace,
 * walk mandatory-field / char-limit / compliance checks and produce a ReadinessResult.
 */
@Injectable({ providedIn: 'root' })
export class ReadinessService {
  evaluate(product: Product, marketplaceId: MarketplaceId): ReadinessResult {
    switch (marketplaceId) {
      case 'amazon': return this.evaluateAmazon(product);
      case 'flipkart': return this.evaluateFlipkart(product);
      case 'meesho': return this.evaluateMeesho(product);
      case 'instagram': return this.evaluateInstagram(product);
      default: return toResult(marketplaceId, [
        { id: 'coming-soon', label: 'Marketplace not yet available', passed: false, severity: 'info' },
      ]);
    }
  }

  private evaluateAmazon(product: Product): ReadinessResult {
    const listing = product.marketplaceListings.amazon;
    const checks: ReadinessCheck[] = [
      { id: 'title', label: 'SEO title present', passed: !!listing.seoTitle, severity: 'error' },
      { id: 'title-length', label: 'Title within 200 characters', passed: listing.seoTitle.length <= 200, severity: 'warning' },
      { id: 'bullets', label: '5 bullet points present', passed: listing.bulletPoints.length >= 5, severity: 'error' },
      { id: 'description', label: 'Long description present', passed: !!listing.longDescription, severity: 'error' },
      { id: 'images', label: 'Main image present', passed: !!product.images.mainImage, severity: 'error' },
      { id: 'brand', label: 'Brand specified', passed: !!listing.brand, severity: 'warning' },
      { id: 'hsn', label: 'HSN code present', passed: !!product.taxation.hsnCode, severity: 'error' },
      { id: 'gst', label: 'GST percentage present', passed: product.taxation.gstPercentage > 0, severity: 'error' },
      { id: 'variation', label: 'Variation theme set', passed: !!listing.variationTheme, severity: 'warning' },
    ];
    return toResult('amazon', checks);
  }

  private evaluateFlipkart(product: Product): ReadinessResult {
    const listing = product.marketplaceListings.flipkart;
    const checks: ReadinessCheck[] = [
      { id: 'title', label: 'SEO title present', passed: !!listing.seoTitle, severity: 'error' },
      { id: 'description', label: 'Description present', passed: !!listing.description, severity: 'error' },
      { id: 'highlights', label: 'Highlights present', passed: listing.highlights.length > 0, severity: 'warning' },
      { id: 'category', label: 'Category set', passed: !!product.classification.flipkartCategory, severity: 'error' },
      { id: 'images', label: 'Main image present', passed: !!product.images.mainImage, severity: 'error' },
      { id: 'brand', label: 'Brand specified', passed: !!listing.brand, severity: 'warning' },
      { id: 'warranty', label: 'Warranty specified', passed: !!listing.warranty, severity: 'warning' },
      { id: 'category-attributes', label: 'Category-specific attributes filled', passed: Object.keys(listing.categoryAttributes ?? {}).length > 0, severity: 'warning' },
    ];
    return toResult('flipkart', checks);
  }

  private evaluateMeesho(product: Product): ReadinessResult {
    const listing = product.marketplaceListings.meesho;
    const checks: ReadinessCheck[] = [
      { id: 'title', label: 'Title present', passed: !!listing.title, severity: 'error' },
      { id: 'description', label: 'Description present', passed: !!listing.description, severity: 'error' },
      { id: 'net-quantity', label: 'Net quantity specified', passed: !!listing.netQuantity, severity: 'error' },
      { id: 'dispatch-time', label: 'Dispatch time specified', passed: !!listing.dispatchTime, severity: 'error' },
      { id: 'category', label: 'Category set', passed: !!product.classification.meeshoCategory, severity: 'error' },
      { id: 'images', label: 'Main image present', passed: !!product.images.mainImage, severity: 'error' },
      { id: 'package-contents', label: 'Package contents specified', passed: !!listing.packageContents, severity: 'warning' },
    ];
    return toResult('meesho', checks);
  }

  private evaluateInstagram(product: Product): ReadinessResult {
    const content = product.socialContent;
    const checks: ReadinessCheck[] = [
      { id: 'caption', label: 'Short caption present', passed: !!content.shortCaption, severity: 'error' },
      { id: 'hashtags', label: 'Hashtags present', passed: content.hashtags.length > 0, severity: 'warning' },
      { id: 'cta', label: 'Call to action present', passed: !!content.cta, severity: 'warning' },
      { id: 'posting-time', label: 'Posting time recommendation present', passed: !!content.suggestedPostingTime, severity: 'info' },
      { id: 'image-prompt', label: 'Image prompt present', passed: !!content.imagePrompt, severity: 'info' },
    ];
    return toResult('instagram', checks);
  }
}
