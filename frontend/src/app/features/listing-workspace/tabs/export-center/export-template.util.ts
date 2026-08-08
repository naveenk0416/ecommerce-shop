import * as XLSX from 'xlsx';

/** How many leading rows of a sheet to scan when looking for a header row. Real marketplace
 * templates often have a few instructional/example rows above the real header. */
const HEADER_SCAN_ROWS = 15;

function normalizeHeader(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]+/g, '') : '';
}

interface HeaderMatch {
  sheetName: string;
  headerRowIndex: number;
  rows: unknown[][];
  matchCount: number;
}

/** Scans every sheet for the row that looks most like a header for `data` (the row with the most
 * cells matching one of `data`'s keys), so templates with instructional or multi-sheet layouts
 * (common for real marketplace bulk-upload templates) still get filled on the right sheet/row. */
function findBestHeaderMatch(workbook: XLSX.WorkBook, data: Record<string, string>): HeaderMatch | null {
  const normalizedKeys = new Set(Object.keys(data).map(normalizeHeader));
  let best: HeaderMatch | null = null;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

    for (let rowIndex = 0; rowIndex < Math.min(rows.length, HEADER_SCAN_ROWS); rowIndex++) {
      const row = rows[rowIndex] ?? [];
      const matchCount = row.filter((cell) => normalizedKeys.has(normalizeHeader(cell))).length;
      if (matchCount > 0 && (!best || matchCount > best.matchCount)) {
        best = { sheetName, headerRowIndex: rowIndex, rows, matchCount };
      }
    }
  }

  return best;
}

/** Fills the given xlsx `workbook` with `data`, matching `data`'s keys against the uploaded
 * template's own column headers (case/punctuation-insensitive) and appending a new row after the
 * template's existing content. Mutates `workbook` in place. Throws if no sheet in the template has
 * a header row with at least one recognizable column. */
export function fillExportTemplate(workbook: XLSX.WorkBook, data: Record<string, string>): void {
  const match = findBestHeaderMatch(workbook, data);
  if (!match) {
    throw new Error(
      'No matching columns found in the uploaded template. Make sure it has a header row with recognizable column names (e.g. "Product Name", "Price", "Description").',
    );
  }

  const { sheetName, headerRowIndex, rows } = match;
  const headerRow = rows[headerRowIndex] ?? [];

  const normalizedData = new Map(Object.entries(data).map(([label, value]) => [normalizeHeader(label), value]));
  const newRow: unknown[] = headerRow.map((header) => normalizedData.get(normalizeHeader(header)) ?? '');

  // Append after the template's last non-empty row rather than overwriting row 1, so any sample
  // rows the template ships with are preserved.
  let insertAt = headerRowIndex + 1;
  for (let i = rows.length - 1; i > headerRowIndex; i--) {
    if ((rows[i] ?? []).some((cell) => cell !== '' && cell != null)) {
      insertAt = i + 1;
      break;
    }
  }

  const updatedRows = [...rows.slice(0, insertAt), newRow, ...rows.slice(insertAt)];
  workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(updatedRows);
}

export interface ExportListingFields {
  name: string;
  description: string;
  priceINR: string;
  sellingPrice?: number;
  gstRate: string;
  hsnCode: string;
  material: string;
  variations: string[];
  quantity?: number;
  platformContent: Record<string, Record<string, string | string[]>>;
}

export interface MarketplaceFieldLabel {
  id: string;
  label: string;
}

/** Builds a flat "column label" -> value map for one marketplace's export, combining the
 * listing's general fields with whatever marketplace-specific content has been generated for it. */
export function buildExportData(
  listing: ExportListingFields,
  category: string,
  marketplaceId: string,
  marketplaceFields: readonly MarketplaceFieldLabel[],
): Record<string, string> {
  const data: Record<string, string> = {
    'Product Name': listing.name || '',
    'Description': listing.description || '',
    'Category': category || '',
    'Price (INR)': listing.sellingPrice != null ? String(listing.sellingPrice) : (listing.priceINR || ''),
    'GST Rate': listing.gstRate || '',
    'HSN Code': listing.hsnCode || '',
    'Material': listing.material || '',
    'Quantity': listing.quantity != null ? String(listing.quantity) : '',
    'Variations': (listing.variations || []).join(', '),
  };

  const platformData = listing.platformContent?.[marketplaceId] || {};
  for (const field of marketplaceFields) {
    const value = platformData[field.id];
    if (value === undefined) continue;
    data[field.label] = Array.isArray(value) ? value.join('; ') : String(value);
  }

  return data;
}
