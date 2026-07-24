import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { Product } from '../models/product.model';
import { MarketplaceId } from '../models/marketplace.model';
import { ExportResult } from '../models/export.model';

function flattenAmazon(product: Product) {
  const l = product.marketplaceListings.amazon;
  return [{
    SKU: product.basicInformation.sku,
    Title: l.seoTitle,
    Bullet1: l.bulletPoints[0] ?? '', Bullet2: l.bulletPoints[1] ?? '', Bullet3: l.bulletPoints[2] ?? '',
    Bullet4: l.bulletPoints[3] ?? '', Bullet5: l.bulletPoints[4] ?? '',
    Description: l.longDescription,
    BackendSearchTerms: l.backendSearchTerms,
    Brand: l.brand, Material: l.material, Color: l.color, Size: l.size,
    ParentSKU: l.parentSku, ChildSKU: l.childSku,
    HSNCode: product.taxation.hsnCode, GST: product.taxation.gstPercentage,
    MRP: product.pricing.mrp, SellingPrice: product.pricing.sellingPrice,
  }];
}

function flattenFlipkart(product: Product) {
  const l = product.marketplaceListings.flipkart;
  return [{
    SKU: product.basicInformation.sku,
    Title: l.seoTitle, Description: l.description, Highlights: l.highlights.join(' | '),
    Brand: l.brand, Model: l.model, Color: l.color, Material: l.material,
    IdealFor: l.idealFor, PackOf: l.packOf, SalesPackage: l.salesPackage,
    Warranty: l.warranty, Weight: l.weight, Dimensions: l.dimensions,
    HSNCode: product.taxation.hsnCode, GST: product.taxation.gstPercentage,
    MRP: product.pricing.mrp, SellingPrice: product.pricing.sellingPrice,
  }];
}

function flattenMeesho(product: Product) {
  const l = product.marketplaceListings.meesho;
  return [{
    SKU: product.basicInformation.sku,
    Title: l.title, Description: l.description, Highlights: l.highlights.join(' | '),
    Material: l.material, Color: l.color, Fabric: l.fabric, Pattern: l.pattern,
    NetQuantity: l.netQuantity, PackOf: l.packOf, Weight: l.weight,
    DispatchTime: l.dispatchTime, PackageContents: l.packageContents,
    HSNCode: product.taxation.hsnCode, GST: product.taxation.gstPercentage,
    MRP: product.pricing.mrp, SellingPrice: product.pricing.sellingPrice,
  }];
}

const FLATTENERS: Partial<Record<MarketplaceId, (p: Product) => Record<string, unknown>[]>> = {
  amazon: flattenAmazon,
  flipkart: flattenFlipkart,
  meesho: flattenMeesho,
};

@Injectable({ providedIn: 'root' })
export class ExportService {
  exportExcel(product: Product, marketplaceId: MarketplaceId): ExportResult {
    const flattener = FLATTENERS[marketplaceId];
    const rows = flattener ? flattener(product) : [product as unknown as Record<string, unknown>];
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, marketplaceId);
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    return this.toResult(blob, 'xlsx', `${marketplaceId}-listing.xlsx`, marketplaceId);
  }

  exportCSV(product: Product, marketplaceId: MarketplaceId): ExportResult {
    const flattener = FLATTENERS[marketplaceId];
    const rows = flattener ? flattener(product) : [product as unknown as Record<string, unknown>];
    const headers = Object.keys(rows[0] ?? {});
    const csvLines = [
      headers.join(','),
      ...rows.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
    return this.toResult(blob, 'csv', `${marketplaceId}-listing.csv`, marketplaceId);
  }

  exportJSON(product: Product): ExportResult {
    const blob = new Blob([JSON.stringify(product, null, 2)], { type: 'application/json' });
    return this.toResult(blob, 'json', `${product.basicInformation.sku || 'listing'}.json`);
  }

  exportPDF(): ExportResult {
    if (typeof window !== 'undefined') {
      window.print();
    }
    return { format: 'pdf', blobUrl: '', filename: 'listing.pdf', generatedAt: new Date().toISOString() };
  }

  async copyJSON(product: Product): Promise<void> {
    await navigator.clipboard.writeText(JSON.stringify(product, null, 2));
  }

  async share(product: Product): Promise<void> {
    const shareData = {
      title: product.basicInformation.productName,
      text: product.marketplaceListings.amazon.seoTitle,
    };
    const nav = navigator as Navigator & { share?: (data: unknown) => Promise<void> };
    if (typeof nav.share === 'function') {
      await nav.share(shareData);
    } else {
      await nav.clipboard.writeText(`${shareData.title}\n${shareData.text}`);
    }
  }

  triggerDownload(result: ExportResult) {
    if (typeof document === 'undefined' || !result.blobUrl) return;
    const a = document.createElement('a');
    a.href = result.blobUrl;
    a.download = result.filename;
    a.click();
  }

  private toResult(blob: Blob, format: ExportResult['format'], filename: string, marketplaceId?: MarketplaceId): ExportResult {
    const blobUrl = typeof URL !== 'undefined' ? URL.createObjectURL(blob) : '';
    return { format, marketplaceId, blobUrl, filename, generatedAt: new Date().toISOString() };
  }
}
