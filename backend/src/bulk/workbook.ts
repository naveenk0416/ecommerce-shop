import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { FieldKey, headerName, headerNumber, isMandatoryText, isSkippedHeader, knownAllowedValues, matchHeader, normalizeHeader } from './fields.js';
import type { SheetFormat } from './format.js';

/**
 * Reading a marketplace bulk-upload template (Meesho Supplier Panel / Flipkart Seller Hub) and
 * writing values back into it.
 *
 * Reading uses ExcelJS for cell values and styles, plus the raw sheet XML for dropdown lists
 * (both the classic <dataValidation> and Excel's newer x14 form, which templates use for lists that
 * live on hidden sheets). Writing never re-saves the workbook through a library: only the data
 * sheet's XML is edited and every other file in the package — styles, hidden sheets, validations,
 * defined names, macros (vbaProject.bin) — is copied byte for byte. Nothing in the file is executed.
 */

export interface TemplateColumn {
  /** 1-based column number. */
  col: number;
  letter: string;
  header: string;
  field: FieldKey | null;
  /** For numbered columns ("Image 3", "Key Feature 2"). */
  number: number | null;
  required: boolean;
  neverInvent: boolean;
  /** Allowed values from the column's dropdown, or null when the column is free text. */
  allowed: string[] | null;
  /** The dropdown depends on another cell (INDIRECT/OFFSET) — values can't be checked here. */
  dependentList: boolean;
}

export interface ParsedTemplate {
  inputFormat: SheetFormat;
  /** .xls can't be written back with its dropdowns intact, so it comes back as .xlsx. */
  outputFormat: SheetFormat;
  sheetName: string;
  sheetPath: string;
  headerRow: number;
  /** First row data may go in (after any instruction rows under the header). */
  dataStartRow: number;
  /** First row under the header with nothing in any template column — writing starts here. */
  firstEmptyRow: number;
  category: string | null;
  columns: TemplateColumn[];
  /** Same category template → same hash (independent of when it was downloaded). */
  hash: string;
  warnings: string[];
}

const SKIP_SHEET = /instruction|read ?me|guide|help|how to|example|sample|note|index|valid|master|dropdown|drop down|lookup|reference|attribute list|list of|values?$/i;
const GENERIC_SHEET = /^(sheet\s*\d*|template|data|listings?|products?|catalog(ue)?s?|upload|bulk.*|main|details?)$/i;
const MAX_HEADER_SCAN_ROWS = 12;

export function columnLetter(col: number): string {
  let s = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function columnNumber(letters: string): number {
  return letters.toUpperCase().split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}

function decodeXml(text: string): string {
  return text
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // Characters XML 1.0 doesn't allow (control chars other than tab/newline/CR).
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const v = value as any;
  if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join('').trim();
  if ('result' in v && v.result !== undefined) return cellText(v.result);
  if ('text' in v) return String(v.text ?? '').trim();
  return '';
}

function isRed(argb: string | undefined): boolean {
  if (!argb || argb.length < 6) return false;
  const hex = argb.slice(-6);
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return r >= 180 && g <= 90 && b <= 90;
}

/** Sheet name → path inside the package (xl/worksheets/sheetN.xml). */
async function sheetPaths(zip: JSZip): Promise<Map<string, string>> {
  const workbook = await zip.file('xl/workbook.xml')!.async('string');
  const rels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? '';
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)) targets.set(m[1], m[2]);
  for (const m of rels.matchAll(/<Relationship\b[^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"/g)) targets.set(m[2], m[1]);
  const out = new Map<string, string>();
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[1])?.[1];
    const rid = /\br:id="([^"]*)"/.exec(m[1])?.[1] ?? /\bid="([^"]*)"/.exec(m[1])?.[1];
    const target = rid ? targets.get(rid) : undefined;
    if (!name || !target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    out.set(decodeXml(name), path);
  }
  return out;
}

interface RawValidation { sqref: string[]; formula: string }

/** List validations from the sheet XML — classic and x14 (lists on other/hidden sheets). */
function listValidations(sheetXml: string): RawValidation[] {
  const out: RawValidation[] = [];
  for (const m of sheetXml.matchAll(/<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>/g)) {
    if (!/\btype="list"/.test(m[1])) continue;
    const sqref = /\bsqref="([^"]*)"/.exec(m[1])?.[1] ?? '';
    const formula = /<formula1>([\s\S]*?)<\/formula1>/.exec(m[2])?.[1] ?? '';
    if (sqref && formula) out.push({ sqref: sqref.split(/\s+/), formula: decodeXml(formula) });
  }
  for (const m of sheetXml.matchAll(/<x14:dataValidation\b([^>]*)>([\s\S]*?)<\/x14:dataValidation>/g)) {
    if (!/\btype="list"/.test(m[1])) continue;
    const sqref = /<xm:sqref>([\s\S]*?)<\/xm:sqref>/.exec(m[2])?.[1] ?? '';
    const formula = /<x14:formula1>[\s\S]*?<xm:f>([\s\S]*?)<\/xm:f>/.exec(m[2])?.[1] ?? '';
    if (sqref && formula) out.push({ sqref: sqref.split(/\s+/), formula: decodeXml(formula) });
  }
  return out;
}

function readRange(wb: ExcelJS.Workbook, sheetName: string, from: string, to: string): string[] {
  const ws = wb.getWorksheet(sheetName);
  if (!ws) return [];
  const a = /^\$?([A-Z]+)\$?(\d+)$/.exec(from.toUpperCase());
  const b = /^\$?([A-Z]+)\$?(\d+)$/.exec(to.toUpperCase());
  if (!a || !b) return [];
  const [c1, c2] = [columnNumber(a[1]), columnNumber(b[1])].sort((x, y) => x - y);
  const [r1, r2] = [Number(a[2]), Math.min(Number(b[2]), Number(a[2]) + 5000)].sort((x, y) => x - y);
  const values: string[] = [];
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const text = cellText(ws.getCell(r, c).value);
      if (text) values.push(text);
    }
  }
  return values;
}

/** Allowed values for a list formula; null when it depends on other cells (INDIRECT/OFFSET). */
function resolveList(wb: ExcelJS.Workbook, formula: string, ownSheet: string): { values: string[] | null; dependent: boolean } {
  const f = formula.trim().replace(/^=/, '');
  if (/^"/.test(f)) return { values: f.replace(/^"|"$/g, '').split(',').map((v) => v.trim()).filter(Boolean), dependent: false };
  if (/\b(INDIRECT|OFFSET|CHOOSE|IF)\s*\(/i.test(f)) return { values: null, dependent: true };
  const ref = /^(?:'((?:[^']|'')+)'|([^!]+))!(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?$/i.exec(f);
  if (ref) {
    const sheet = (ref[1] ?? ref[2]).replace(/''/g, "'");
    return { values: readRange(wb, sheet, ref[3], ref[4] ?? ref[3]), dependent: false };
  }
  const local = /^(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?$/i.exec(f);
  if (local) return { values: readRange(wb, ownSheet, local[1], local[2] ?? local[1]), dependent: false };
  // A defined name ("ColorList").
  try {
    const ranges: string[] = (wb.definedNames as any).getRanges(f)?.ranges ?? [];
    if (ranges.length) return resolveList(wb, ranges[0], ownSheet);
  } catch {
    // Not a defined name.
  }
  return { values: null, dependent: false };
}

function scoreHeaderRow(ws: ExcelJS.Worksheet, row: number): number {
  let matches = 0;
  let texts = 0;
  const r = ws.getRow(row);
  for (let c = 1; c <= Math.min(ws.columnCount, 300); c++) {
    const text = cellText(r.getCell(c).value);
    if (!text) continue;
    // Headers may carry a long description after the name (Meesho) — the name is what counts.
    if (headerName(text).length <= 60) texts += 1;
    if (matchHeader(text)) matches += 1;
  }
  return texts < 2 ? 0 : matches * 3 + texts * 0.2;
}

function isInstructionRow(ws: ExcelJS.Worksheet, row: number, cols: number[]): boolean {
  const texts = cols.map((c) => cellText(ws.getRow(row).getCell(c).value)).filter(Boolean);
  if (texts.length === 0) return false;
  if (texts.some((t) => /^(mandatory|optional|required|compulsory|conditional)$/i.test(t))) return true;
  if (/^(example|sample|e\.?g\.?|note|instructions?)\b/i.test(texts[0])) return true;
  // Meesho: "Tutorial Link | Watch Explainer Video" under the header.
  if (texts.some((t) => /\b(tutorial|explainer video|watch (the )?video)\b/i.test(t))) return true;
  if (texts.some((t) => /\b(please (enter|select|fill|provide)|enter the|select (the|from)|should be|must be|maximum \d+ characters|allowed values)\b/i.test(t))) return true;
  return texts.filter((t) => t.length > 45).length > texts.length / 2;
}

/** Old .xls → .xlsx bytes (SheetJS), so the rest of the pipeline is one format. */
function xlsToXlsx(buf: Buffer): Buffer {
  const wb = XLSX.read(buf, { type: 'buffer', cellStyles: true, cellDates: false });
  // Excel tolerates overlapping merged ranges in old .xls files (Flipkart's "Index" sheet has
  // hundreds); .xlsx readers reject them. Keep the first of any overlapping set.
  for (const name of wb.SheetNames) {
    const merges = wb.Sheets[name]?.['!merges'];
    if (!merges?.length) continue;
    const kept: XLSX.Range[] = [];
    for (const m of merges) {
      if (!kept.some((k) => m.s.r <= k.e.r && k.s.r <= m.e.r && m.s.c <= k.e.c && k.s.c <= m.e.c)) kept.push(m);
    }
    wb.Sheets[name]['!merges'] = kept;
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true }) as Buffer;
}

/** The bytes the rest of the pipeline works on (.xls is converted once, at upload). */
export function workingBytes(buf: Buffer, format: SheetFormat): Buffer {
  return format === 'xls' ? xlsToXlsx(buf) : buf;
}

/** Header fill colour as "RRGGBB" (uppercase), or null. */
function fillRgb(cell: ExcelJS.Cell): string | null {
  const argb = (cell.fill as any)?.fgColor?.argb as string | undefined;
  return argb && /^[0-9A-F]{6,8}$/i.test(argb) ? argb.slice(-6).toUpperCase() : null;
}

/** Flipkart legend: "Blue cells have to be mandatorily filled" (blue, not purple). */
function isBlue(rgb: string | null): boolean {
  if (!rgb) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(rgb.slice(i, i + 2), 16));
  return b > r + 40 && g >= r;
}

function isGrey(rgb: string | null): boolean {
  if (!rgb) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(rgb.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) < 12 && r > 150 && r < 230;
}

/**
 * @param original the file as uploaded — for .xls, header colours are read from it because the
 *   conversion to .xlsx doesn't keep cell fills.
 */
export async function parseTemplate(working: Buffer, inputFormat: SheetFormat, original?: Buffer): Promise<ParsedTemplate> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(working as any);
  const zip = await JSZip.loadAsync(working);
  const paths = await sheetPaths(zip);
  const warnings: string[] = [];

  const visible = wb.worksheets.filter((ws) => ws.state !== 'hidden' && ws.state !== 'veryHidden');
  const candidates = visible.filter((ws) => !SKIP_SHEET.test(ws.name));
  const pool = candidates.length ? candidates : visible;

  let best: { ws: ExcelJS.Worksheet; row: number; score: number } | null = null;
  for (const ws of pool) {
    for (let row = 1; row <= Math.min(MAX_HEADER_SCAN_ROWS, Math.max(ws.rowCount, 1)); row++) {
      const score = scoreHeaderRow(ws, row);
      if (!best || score > best.score) best = { ws, row, score };
    }
  }
  if (!best || best.score < 3) {
    throw new Error('We couldn\'t find the column headings in this file. Please upload the bulk template exactly as downloaded from the marketplace.');
  }
  const { ws, row: headerRow } = best;
  const sheetPath = paths.get(ws.name);
  if (!sheetPath) throw new Error('This workbook is missing its sheet data.');

  // Header cells (a header can span a merged cell; ExcelJS reports the master's value on each).
  const headerCells: Array<{ col: number; text: string; red: boolean; fill: string | null }> = [];
  const headerRowObj = ws.getRow(headerRow);
  const seen = new Set<string>();
  for (let c = 1; c <= Math.min(ws.columnCount, 300); c++) {
    const cell = headerRowObj.getCell(c);
    const text = cellText(cell.value);
    if (!text) continue;
    const master = (cell as any).master?.address ?? cell.address;
    if (seen.has(master)) continue;
    seen.add(master);
    headerCells.push({ col: c, text, red: isRed((cell.font?.color as any)?.argb), fill: fillRgb(cell) });
  }
  const cols = headerCells.map((h) => h.col);

  // Instruction rows right under the header ("Mandatory/Optional", "Please enter…", examples).
  let dataStartRow = headerRow + 1;
  while (dataStartRow <= headerRow + 5 && isInstructionRow(ws, dataStartRow, cols)) dataStartRow += 1;

  // "Mandatory" / "* Compulsory Field" / "Do not fill these columns" markers around the header.
  const markerRequired = new Set<number>();
  const doNotFill = new Set<number>();
  // Up to 4 rows under the header: Flipkart has types, an example and descriptions before row 5.
  for (let r = Math.max(1, headerRow - 2); r <= Math.max(dataStartRow - 1, headerRow + 4); r++) {
    if (r === headerRow) continue;
    for (const c of cols) {
      const marker = cellText(ws.getRow(r).getCell(c).value);
      if (/^\*?\s*(mandatory|required|compulsory)\b/i.test(marker)) markerRequired.add(c);
      // Meesho "Do not fill these 2 columns."; Flipkart "To be filled by Flipkart" / "To be filled later".
      if (/\bdo not (fill|edit|change)\b|\bto be filled (by flipkart|by meesho|by marketplace|later)\b/i.test(marker)) doNotFill.add(c);
    }
  }

  // Dropdowns.
  const sheetXml = await zip.file(sheetPath)!.async('string');
  const allowedByCol = new Map<number, { values: string[] | null; dependent: boolean }>();
  for (const v of listValidations(sheetXml)) {
    const resolved = resolveList(wb, v.formula, ws.name);
    for (const range of v.sqref) {
      const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(range.replace(/\$/g, ''));
      if (!m) continue;
      const endRow = Number(m[4] ?? m[2]);
      if (endRow < dataStartRow) continue;
      const [c1, c2] = [columnNumber(m[1]), columnNumber(m[3] ?? m[1])];
      for (let c = c1; c <= c2; c++) if (!allowedByCol.has(c)) allowedByCol.set(c, resolved);
    }
  }

  // Flipkart keeps value lists outside data validations (which old .xls files lose anyway):
  // an "Allowed Values" sheet (Index): a row of attribute names with their values below …
  const colByName = new Map(headerCells.map((h) => [normalizeHeader(headerName(h.text)), h.col]));
  const namedLists = new Map<string, number>();
  /** Same list, whatever the order (the Index sorts some lists differently). */
  const listKey = (values: string[]) => [...new Set(values)].sort().join('\n');
  for (const sheet of wb.worksheets) {
    if (sheet === ws) continue;
    let hasAllowedValues = false;
    sheet.eachRow((row, r) => { if (r <= 5) row.eachCell((cell) => { if (/^allowed values$/i.test(cellText(cell.value))) hasAllowedValues = true; }); });
    if (!hasAllowedValues) continue;
    sheet.eachRow((row, r) => {
      const hits: Array<[number, number]> = [];
      row.eachCell((cell, c) => { const col = colByName.get(normalizeHeader(cellText(cell.value))); if (col) hits.push([c, col]); });
      if (hits.length < 2) return;
      for (const [c, col] of hits) {
        if (allowedByCol.has(col)) continue;
        const values: string[] = [];
        for (let rr = r + 1; rr <= sheet.rowCount; rr++) {
          const t = cellText(sheet.getRow(rr).getCell(c).value);
          if (!t) break;
          values.push(t);
        }
        if (values.length) {
          allowedByCol.set(col, { values, dependent: false });
          namedLists.set(listKey(values), col);
        }
      }
    });
  }
  // … and hidden "DropDownValuesForColumnN" sheets (N = 0-based column). Flipkart files can carry
  // stale ones from an older layout (Column10 = the Type list, landing on "Listing Status"), so a
  // list the Index already gives to another column by name is skipped.
  for (const sheet of wb.worksheets) {
    const m = /^DropDownValuesForColumn(\d+)$/i.exec(sheet.name);
    const col = m ? Number(m[1]) + 1 : 0;
    if (!m || allowedByCol.has(col)) continue;
    const values: string[] = [];
    sheet.eachRow((row) => { const t = cellText(row.getCell(1).value); if (t) values.push(t); });
    const owner = namedLists.get(listKey(values));
    if (owner !== undefined && owner !== col) continue;
    if (values.length) allowedByCol.set(col, { values, dependent: false });
  }

  // System columns whose dropdown didn't survive (old .xls): values the marketplace has told us.
  for (const h of headerCells) {
    const known = knownAllowedValues(h.text);
    if (known && !allowedByCol.get(h.col)?.values?.length) allowedByCol.set(h.col, { values: known, dependent: false });
  }

  // Colour-coded templates (Flipkart): the legend says blue = mandatory, grey = filled by Flipkart.
  const colourLegend = { blueRequired: false, greyByMarketplace: false };
  for (const sheet of wb.worksheets) {
    if (sheet === ws) continue;
    sheet.eachRow((row, r) => {
      if (r > 300) return;
      row.eachCell((cell) => {
        const t = cellText(cell.value);
        if (/blue cells?[^.]*mandator/i.test(t)) colourLegend.blueRequired = true;
        if (/gr[ae]y cells?[^.]*filled by (flipkart|meesho|the marketplace)/i.test(t)) colourLegend.greyByMarketplace = true;
      });
    });
  }
  // .xls: the conversion drops cell fills — read the header colours from the original file.
  if ((colourLegend.blueRequired || colourLegend.greyByMarketplace) && inputFormat === 'xls' && original) {
    const sheet = XLSX.read(original, { type: 'buffer', cellStyles: true }).Sheets[ws.name];
    for (const h of headerCells) {
      const rgb = sheet?.[XLSX.utils.encode_cell({ r: headerRow - 1, c: h.col - 1 })]?.s?.fgColor?.rgb as string | undefined;
      if (rgb) h.fill = rgb.slice(-6).toUpperCase();
    }
  }
  if (colourLegend.greyByMarketplace) for (const h of headerCells) if (isGrey(h.fill)) doNotFill.add(h.col);

  // Label/system columns ("Fields + Description", "ERROR STATUS", "Do not fill…") are left alone.
  const fillable = headerCells.filter((h) => !isSkippedHeader(h.text) && !doNotFill.has(h.col));
  const columns: TemplateColumn[] = fillable.map((h) => {
    const rule = matchHeader(h.text);
    const list = allowedByCol.get(h.col);
    const allowed = list?.values ? Array.from(new Set(list.values)).slice(0, 2000) : null;
    const name = headerName(h.text) || h.text;
    return {
      col: h.col,
      letter: columnLetter(h.col),
      header: name,
      // Unknown dropdown columns: the AI may pick a value the product text clearly states.
      field: rule?.key ?? (allowed?.length ? 'attribute' : null),
      number: headerNumber(h.text),
      required: isMandatoryText(name) || h.red || markerRequired.has(h.col) || (colourLegend.blueRequired && isBlue(h.fill)),
      neverInvent: !!rule?.neverInvent,
      allowed: allowed && allowed.length ? allowed : null,
      dependentList: !!list?.dependent,
    };
  });

  // First fully empty row under the header — existing rows the seller already filled are kept.
  let firstEmptyRow = dataStartRow;
  for (let r = dataStartRow; r <= Math.max(ws.rowCount, dataStartRow); r++) {
    const any = cols.some((c) => cellText(ws.getRow(r).getCell(c).value));
    firstEmptyRow = r;
    if (!any) break;
    firstEmptyRow = r + 1;
  }

  // Category: a non-generic sheet name, or a "Category: …" cell above the header.
  let category: string | null = GENERIC_SHEET.test(ws.name.trim()) ? null : ws.name.trim();
  for (let r = 1; r < headerRow && !category; r++) {
    for (let c = 1; c <= Math.min(ws.columnCount, 30); c++) {
      const text = cellText(ws.getRow(r).getCell(c).value);
      const inline = /^(?:category|vertical|sub ?category)\s*[:\-–]\s*(.+)$/i.exec(text);
      if (inline) { category = inline[1].trim(); break; }
      if (/^(category|vertical)$/i.test(text)) {
        const next = cellText(ws.getRow(r).getCell(c + 1).value);
        if (next) { category = next; break; }
      }
    }
  }

  if (inputFormat === 'xls') warnings.push('XLS_CONVERTED');
  if (columns.some((c) => c.dependentList)) warnings.push('DEPENDENT_LISTS');

  const hash = crypto.createHash('sha256')
    .update(JSON.stringify({ sheet: ws.name, headers: columns.map((c) => [normalizeHeader(c.header), c.allowed?.length ?? 0]) }))
    .digest('hex').slice(0, 32);

  return {
    inputFormat,
    outputFormat: inputFormat === 'xls' ? 'xlsx' : inputFormat,
    sheetName: ws.name,
    sheetPath,
    headerRow,
    dataStartRow,
    firstEmptyRow,
    category,
    columns,
    hash,
    warnings,
  };
}

// ---------------- Writing ----------------

export interface CellWrite {
  row: number;
  col: number;
  value: string | number;
}

interface RowPart { r: number; attrs: string; cells: Array<{ col: number; xml: string; style?: string }> }

/**
 * Writes values into the data sheet's XML and returns the new package. Only that one XML file
 * changes; cells keep their existing style (or take the column's default style), strings are
 * written inline so the shared-string table is untouched.
 */
export async function writeCells(working: Buffer, sheetPath: string, writes: CellWrite[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(working);
  const file = zip.file(sheetPath);
  if (!file) throw new Error('The template sheet is missing.');
  let xml = await file.async('string');

  // Column default styles from <cols>.
  const colStyle = new Map<number, string>();
  for (const m of xml.matchAll(/<col\b([^>]*)\/?>/g)) {
    const min = Number(/\bmin="(\d+)"/.exec(m[1])?.[1]);
    const max = Number(/\bmax="(\d+)"/.exec(m[1])?.[1]);
    const style = /\bstyle="(\d+)"/.exec(m[1])?.[1];
    if (style && min && max) for (let c = min; c <= Math.min(max, min + 500); c++) colStyle.set(c, style);
  }

  // Normalise <sheetData/> to an open/close pair.
  xml = xml.replace(/<sheetData\s*\/>/, '<sheetData></sheetData>');
  const sd = /<sheetData>([\s\S]*?)<\/sheetData>/.exec(xml);
  if (!sd) throw new Error('The template sheet has no data section.');

  const rows = new Map<number, RowPart>();
  let lastRow = 0;
  for (const m of sd[1].matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const attrs = m[1];
    const r = Number(/\br="(\d+)"/.exec(attrs)?.[1]) || lastRow + 1;
    lastRow = r;
    const cells: RowPart['cells'] = [];
    let lastCol = 0;
    for (const c of (m[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(c[1])?.[1];
      const col = ref ? columnNumber(ref) : lastCol + 1;
      lastCol = col;
      cells.push({ col, xml: ref ? c[0] : c[0].replace('<c', `<c r="${columnLetter(col)}${r}"`), style: /\bs="(\d+)"/.exec(c[1])?.[1] });
    }
    rows.set(r, { r, attrs: attrs.replace(/\s*\br="\d+"/, ''), cells });
  }

  let maxRow = 0;
  let maxCol = 0;
  for (const w of writes) {
    if (w.value === '' || w.value === null || w.value === undefined) continue;
    maxRow = Math.max(maxRow, w.row);
    maxCol = Math.max(maxCol, w.col);
    const row = rows.get(w.row) ?? { r: w.row, attrs: '', cells: [] };
    rows.set(w.row, row);
    const existing = row.cells.find((c) => c.col === w.col);
    const style = existing?.style ?? colStyle.get(w.col) ?? /\bs="(\d+)"/.exec(row.attrs)?.[1];
    const ref = `${columnLetter(w.col)}${w.row}`;
    const s = style ? ` s="${style}"` : '';
    const cellXml = typeof w.value === 'number' && Number.isFinite(w.value)
      ? `<c r="${ref}"${s}><v>${w.value}</v></c>`
      : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(w.value))}</t></is></c>`;
    if (existing) existing.xml = cellXml;
    else row.cells.push({ col: w.col, xml: cellXml, style });
    // A stale "spans" hint could hide the new cells from some readers.
    row.attrs = row.attrs.replace(/\s*\bspans="[^"]*"/, '');
  }

  const body = [...rows.values()]
    .sort((a, b) => a.r - b.r)
    .map((row) => {
      const cells = row.cells.sort((a, b) => a.col - b.col).map((c) => c.xml).join('');
      return cells ? `<row r="${row.r}"${row.attrs}>${cells}</row>` : `<row r="${row.r}"${row.attrs}/>`;
    })
    .join('');
  xml = xml.slice(0, sd.index) + `<sheetData>${body}</sheetData>` + xml.slice(sd.index + sd[0].length);

  // Keep the used-range hint covering what we wrote.
  if (maxRow && maxCol) {
    xml = xml.replace(/<dimension ref="([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?"\s*\/>/, (_m, c1, r1, c2, r2) => {
      const endCol = Math.max(columnNumber(c2 ?? c1), maxCol);
      const endRow = Math.max(Number(r2 ?? r1), maxRow);
      return `<dimension ref="${c1}${r1}:${columnLetter(endCol)}${endRow}"/>`;
    });
  }

  zip.file(sheetPath, xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
