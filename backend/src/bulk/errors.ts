import ExcelJS from 'exceljs';
import { headerName, normalizeHeader } from './fields.js';
import { cellText, type ParsedTemplate } from './workbook.js';

/**
 * Reading the file a marketplace sends back after a bulk upload fails — so the seller can see
 * each rejected row next to the row we filled, fix it and download the file again.
 *
 * Both marketplaces return the same template with the system columns filled:
 * - Meesho: "ERROR STATUS" = INVALID, "ERROR MESSAGE" = "MRP should be greater than listing price by 35.00 Rs. …"
 * - Flipkart: "Catalog QC Status" = Failed, "QC Failed Reason (if any)" =
 *   "1 error(s) found⏎1. [fulfilled_by]: Invalid value given for attribute: service_profile. Allowed values are: FA,seller,SellerSmart"
 *   (and "Product Data Status" / "Disapproval Reason (if any)" after QC).
 */

export interface ErrorMessage {
  text: string;
  /** Template column the message is about, when we can tell. */
  col: number | null;
}

export interface ErrorRow {
  /** Row number in the returned file. */
  rowNumber: number;
  /** 0-based position among the rows we wrote (row − first data row of the file we sent). */
  index: number;
  sku: string;
  title: string;
  status: string;
  messages: ErrorMessage[];
}

// Not Flipkart "Listing Status" (ACTIVE / INACTIVE) — the seller fills that one.
const STATUS_HEADER = /^(error status|(catalog )?qc status|product data status|upload status)$/;
const MESSAGE_HEADER = /^(error message|errors?|qc failed reason( if any)?|disapproval reason( if any)?|rejection reason)$/;
/** Status values that mean the row went through. */
const OK_STATUS = /^(valid|success|successful|passed|pass|approved|ok)$/i;
const MAX_SCAN_ROWS = 2000;
/** Flipkart's type / example / description rows under the header ("Approved / Disapproved", "To be filled by Flipkart"). */
const INSTRUCTION_TEXT = /\bto be filled\b|approved \/ disapproved|check summary sheet|fast validate|for system use|^(dropdown|single - text|url)$/i;

const squash = (w: string) => w.replace(/(.)\1+/g, '$1').replace(/(ment|ed|ing|s)$/, '');
const words = (s: string) => normalizeHeader(s.replace(/_/g, ' ')).split(' ').filter(Boolean).map(squash);

/** Flipkart "[fulfilled_by]" → the "Fullfilment by" column. */
function columnForAttribute(attr: string, parsed: ParsedTemplate): number | null {
  const want = words(attr).join(' ');
  if (!want) return null;
  const exact = parsed.columns.find((c) => words(c.header).join(' ') === want);
  if (exact) return exact.col;
  const loose = parsed.columns.find((c) => {
    const have = words(c.header).join(' ');
    return have.length > 2 && (have.includes(want) || want.includes(have));
  });
  return loose?.col ?? null;
}

/** Meesho "MRP should be greater than …" → the column whose name the message mentions (longest wins). */
function columnMentioned(text: string, parsed: ParsedTemplate): number | null {
  const hay = ` ${normalizeHeader(text)} `;
  let best: { col: number; len: number } | null = null;
  for (const c of parsed.columns) {
    const name = normalizeHeader(c.header);
    if (name.length < 3 || !hay.includes(` ${name} `)) continue;
    if (!best || name.length > best.len) best = { col: c.col, len: name.length };
  }
  return best?.col ?? null;
}

export function splitMessages(raw: string, parsed: ParsedTemplate): ErrorMessage[] {
  return raw
    // Meesho joins several errors with "; " ("…add commission.; Eagle(Warning) detected in BRAND NAME …").
    .split(/\r?\n|(?<=\.);\s*/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\d+ error\(s\) found$/i.test(line))
    .map((line) => {
      const text = line.replace(/^\d+[.)]\s*/, '');
      const attr = /^\[([^\]]+)\]\s*:?\s*/.exec(text);
      return attr
        ? { text, col: columnForAttribute(attr[1], parsed) ?? columnMentioned(text.slice(attr[0].length), parsed) }
        : { text, col: columnMentioned(text, parsed) };
    });
}

/**
 * Failed rows in a returned file. Throws NO_ERROR_COLUMNS when the file has no status / reason
 * columns (it isn't a marketplace error report).
 */
export async function readErrorReport(working: Buffer, parsed: ParsedTemplate): Promise<ErrorRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(working as any);
  const ws = wb.getWorksheet(parsed.sheetName) ?? wb.worksheets.find((s) => s.state === 'visible' && !/instruction|example|valid|index|summary/i.test(s.name));
  if (!ws) throw Object.assign(new Error('No data sheet'), { code: 'NO_ERROR_COLUMNS' });

  // The returned file has the template's layout; look a few rows around the header anyway.
  let found: { row: number; status: number[]; message: number[] } | null = null;
  for (let r = Math.max(1, parsed.headerRow - 2); r <= parsed.headerRow + 2 && !found; r++) {
    const status: number[] = [];
    const message: number[] = [];
    ws.getRow(r).eachCell((cell, c) => {
      const name = normalizeHeader(headerName(cellText(cell.value)));
      if (STATUS_HEADER.test(name)) status.push(c);
      else if (MESSAGE_HEADER.test(name)) message.push(c);
    });
    if (message.length) found = { row: r, status, message };
  }
  if (!found) throw Object.assign(new Error('No error columns'), { code: 'NO_ERROR_COLUMNS' });

  const skuCol = parsed.columns.find((c) => c.field === 'sku')?.col;
  const titleCol = parsed.columns.find((c) => c.field === 'title')?.col;
  const templateCols = parsed.columns.map((c) => c.col);
  const out: ErrorRow[] = [];
  const last = Math.min(ws.rowCount, parsed.dataStartRow + MAX_SCAN_ROWS);
  for (let r = parsed.dataStartRow; r <= last; r++) {
    const row = ws.getRow(r);
    if (!templateCols.some((c) => cellText(row.getCell(c).value))) continue;
    const statuses = found.status.map((c) => cellText(row.getCell(c).value)).filter(Boolean);
    const raw = found.message.map((c) => cellText(row.getCell(c).value)).filter(Boolean);
    const failed = statuses.some((s) => !OK_STATUS.test(s)) || (raw.length > 0 && !statuses.some((s) => OK_STATUS.test(s)));
    if (!failed || [...statuses, ...raw].some((t) => INSTRUCTION_TEXT.test(t))) continue;
    out.push({
      rowNumber: r,
      index: r - parsed.firstEmptyRow,
      sku: skuCol ? cellText(row.getCell(skuCol).value) : '',
      title: titleCol ? cellText(row.getCell(titleCol).value) : '',
      status: statuses.find((s) => !OK_STATUS.test(s)) ?? statuses[0] ?? '',
      messages: raw.flatMap((m) => splitMessages(m, parsed)),
    });
  }
  return out;
}
