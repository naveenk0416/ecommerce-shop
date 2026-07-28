import { Injectable } from '@angular/core';
import { apiFetch } from './api';

export interface BarcodeLookupResult {
  found: boolean;
  barcode: string;
  title?: string | null;
  brand?: string | null;
  category?: string | null;
  description?: string | null;
  color?: string | null;
  size?: string | null;
  weight?: string | null;
  images?: string[];
  lowestPrice?: number | null;
  highestPrice?: number | null;
  currency?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class BarcodeService {
  /** Looks up a scanned UPC/EAN against the public barcode database, proxied through our backend. */
  async lookup(code: string): Promise<BarcodeLookupResult> {
    return apiFetch<BarcodeLookupResult>(`/barcode/${encodeURIComponent(code)}/lookup`);
  }
}
