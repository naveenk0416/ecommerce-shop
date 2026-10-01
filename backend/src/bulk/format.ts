import JSZip from 'jszip';

export type SheetFormat = 'xlsx' | 'xlsm' | 'xls';

export const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(buf: Buffer, magic: number[]): boolean {
  return buf.length >= magic.length && magic.every((b, i) => buf[i] === b);
}

/**
 * The spreadsheet format from the file's bytes — never from its name. Returns null for anything
 * that isn't a real Excel workbook (renamed PDFs, CSVs, zips that aren't workbooks…).
 * Macros in .xlsm files are kept in the output but never run: nothing here executes file content.
 */
export async function detectFormat(buf: Buffer): Promise<SheetFormat | null> {
  if (startsWith(buf, OLE_MAGIC)) {
    // Legacy .xls (BIFF8 inside an OLE2 container). SheetJS confirms it's a workbook when parsed.
    return 'xls';
  }
  if (!startsWith(buf, ZIP_MAGIC)) return null;
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    return null;
  }
  const types = await zip.file('[Content_Types].xml')?.async('string');
  if (!types || !zip.file('xl/workbook.xml')) return null;
  if (/macroEnabled/i.test(types) || zip.file('xl/vbaProject.bin')) return 'xlsm';
  return 'xlsx';
}

export function extensionFor(format: SheetFormat): string {
  return format;
}

export function mimeFor(format: SheetFormat): string {
  switch (format) {
    case 'xls': return 'application/vnd.ms-excel';
    case 'xlsm': return 'application/vnd.ms-excel.sheet.macroEnabled.12';
    default: return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
}
