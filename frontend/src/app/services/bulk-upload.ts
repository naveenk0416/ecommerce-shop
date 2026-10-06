import { Injectable } from '@angular/core';
import { apiBase, apiFetch, ApiError, getAuthToken } from './api';
import { getDeviceId } from '../utils/device-id';

export type BulkMarketplace = 'meesho' | 'flipkart';
export type BulkFormat = 'xlsx' | 'xlsm' | 'xls';

export interface BulkColumn {
  col: number;
  letter: string;
  header: string;
  field: string | null;
  required: boolean;
  neverInvent: boolean;
  allowed: string[] | null;
  dependentList: boolean;
}

export interface BulkTemplateInfo {
  id: string;
  marketplace: BulkMarketplace;
  fileName: string | null;
  inputFormat: BulkFormat;
  outputFormat: BulkFormat;
  sheetName: string;
  category: string | null;
  headerRow: number;
  firstRow: number;
  columns: BulkColumn[];
  /** 'XLS_CONVERTED' | 'DEPENDENT_LISTS' | 'FEED_USED' */
  warnings: string[];
  maxRows: number;
}

export type BulkCellStatus = 'filled' | 'adjusted' | 'ai' | 'must_fill' | 'empty';

export interface BulkCell {
  value: string;
  status: BulkCellStatus;
  from?: string;
}

export interface BulkRow {
  draftId: string;
  /** draftId, or draftId:variantId — products with sizes have one row per size/colour. */
  rowKey: string;
  variantId: string | null;
  /** "Pink / M" */
  variantLabel: string | null;
  title: string;
  category: string;
  categoryMismatch: boolean;
  cells: Record<number, BulkCell>;
}

export interface BulkReport {
  filledColumns: string[];
  emptyMandatory: Array<{ header: string; rows: number }>;
  adjusted: Array<{ header: string; from: string; to: string }>;
  aiChosen: Array<{ header: string; count: number }>;
  /** 'IMAGES_SEPARATE' | 'SAVE_TO_INVENTORY_FOR_PRICE' */
  instructions: string[];
  filledPercent: number;
}

/** A row the marketplace rejected, read from its error file. */
export interface BulkErrorRow {
  rowNumber: number;
  /** 0-based position among the rows we wrote. */
  index: number;
  sku: string;
  title: string;
  /** "INVALID" (Meesho), "Failed" (Flipkart) */
  status: string;
  /** col: the template column the message is about, when known. */
  messages: Array<{ text: string; col: number | null }>;
}

export interface SellerProfile {
  brand?: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  packerName?: string;
  packerAddress?: string;
  countryOfOrigin?: string;
  gstHandling?: 'inclusive' | 'exclusive';
  pickupPincode?: string;
}

export const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024;

/** "Bulk upload file" — fill a Meesho / Flipkart bulk template with rows from My Listings. */
@Injectable({ providedIn: 'root' })
export class BulkUploadService {
  /** Sends the file's bytes as-is (a 10 MB template doesn't fit the JSON body limit as base64). */
  private async postFile<T>(path: string, file: File): Promise<T> {
    const headers = new Headers({ 'Content-Type': 'application/octet-stream' });
    const token = getAuthToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const device = getDeviceId();
    if (device) headers.set('X-Device-Id', device);
    const response = await fetch(`${apiBase}${path}`, { method: 'POST', headers, body: file });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error: ApiError = new Error(data?.error || 'Upload failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data as T;
  }

  uploadTemplate(file: File, marketplace: BulkMarketplace): Promise<BulkTemplateInfo> {
    return this.postFile(`/bulk/templates?marketplace=${marketplace}&name=${encodeURIComponent(file.name)}`, file);
  }

  /** The error file Meesho / Flipkart gives back after rejecting rows → the rows it rejected. */
  async uploadErrors(templateId: string, file: File): Promise<BulkErrorRow[]> {
    return (await this.postFile<{ rows: BulkErrorRow[] }>(`/bulk/templates/${templateId}/errors`, file)).rows;
  }

  fill(templateId: string, draftIds: string[]): Promise<{ rows: BulkRow[]; report: BulkReport }> {
    return apiFetch(`/bulk/templates/${templateId}/fill`, { method: 'POST', body: { draftIds } });
  }

  /** The filled file, in the template's own format (.xls comes back as .xlsx). */
  async download(templateId: string, rows: Array<{ cells: Record<number, string> }>): Promise<{ blob: Blob; fileName: string }> {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const token = getAuthToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${apiBase}/bulk/templates/${templateId}/download`, { method: 'POST', headers, body: JSON.stringify({ rows }) });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const error: ApiError = new Error(data?.error || 'Download failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'bulk-upload-filled.xlsx';
    return { blob: await response.blob(), fileName };
  }

  async getProfile(): Promise<SellerProfile> {
    return (await apiFetch<{ profile: SellerProfile }>('/bulk/profile')).profile ?? {};
  }

  async saveProfile(profile: SellerProfile): Promise<SellerProfile> {
    return (await apiFetch<{ profile: SellerProfile }>('/bulk/profile', { method: 'PUT', body: profile })).profile;
  }
}
