/**
 * Checks real marketplace bulk templates without the app or a database:
 *
 *   npm run bulk:check                      (reads ../samples/bulk-templates)
 *   npm run bulk:check -- path/to/folder
 *
 * For every .xlsx/.xls/.xlsm file it prints what was detected (data sheet, header row, first
 * data row, category, mandatory columns, dropdowns, fields we recognise / don't), then writes
 * "<name>-filled-1.<ext>" and "<name>-filled-10.<ext>" next to it with sample kurti rows, so the
 * files can be opened in Excel (dropdowns + formatting intact?) and test-uploaded on the panel.
 * No AI calls are made here (dropdown values are only matched exactly/fuzzily).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectFormat } from '../bulk/format.js';
import { parseTemplate, workingBytes, writeCells, type CellWrite } from '../bulk/workbook.js';
import { fillRows, type ListingSource, type Marketplace } from '../bulk/fill.js';

const dir = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../../../samples/bulk-templates', import.meta.url)));
const files = readdirSync(dir).filter((f) => /\.(xlsx|xls|xlsm)$/i.test(f) && !/-filled-\d+\./.test(f));
if (files.length === 0) {
  console.log(`No templates in ${dir}. Put the downloaded Meesho / Flipkart templates there (names containing "meesho" or "flipkart").`);
  process.exit(0);
}

const v = (value: string) => ({ values: [value] });
function sample(i: number): ListingSource {
  return {
    draftId: `sample${String(i).padStart(18, '0')}`,
    imageUrl: 'https://api.sellassist.in/api/drafts/000000000000000000000000/image.jpg',
    results: {
      general: { productTitle: v(`Women Cotton Kurti ${i}`), category: v('Women > Ethnic Wear > Kurtis'), hsnCode: v('6104'), description: v('Pink cotton straight kurti with 3/4 sleeves and floral print.') },
      meesho: { listingTitle: v(`Women Pink Cotton Kurti ${i}`), description: v('Soft cotton kurti with floral print.'), color: v('Pink'), size: v('M') },
      flipkart: { seoTitle: v(`Women Printed Cotton Straight Kurta ${i}`), keyHighlight1: v('Pure cotton'), keyHighlight2: v('Floral print'), description: v('Straight cotton kurta.'), material: v('Cotton'), color: v('Pink') },
      amazon: { material: v('Cotton') },
    },
    inventory: { sku: `SA-SAMPLE-${i}`, sellingPrice: 499, mrp: 999, quantity: 10, gstRate: 5, hsnCode: '6104' },
  };
}

for (const file of files) {
  const full = path.join(dir, file);
  const buf = readFileSync(full);
  const marketplace: Marketplace = /flipkart/i.test(file) ? 'flipkart' : 'meesho';
  console.log(`\n=== ${file} (${marketplace}) ===`);
  const format = await detectFormat(buf);
  if (!format) { console.log('  NOT an Excel workbook'); continue; }
  try {
    const working = workingBytes(buf, format);
    const t = await parseTemplate(working, format, buf);
    console.log(`  format ${format} → output ${t.outputFormat}; sheet "${t.sheetName}"; header row ${t.headerRow}; data from row ${t.dataStartRow}; first empty row ${t.firstEmptyRow}; category ${t.category ?? '(not found)'}`);
    console.log(`  ${t.columns.length} columns, ${t.columns.filter((c) => c.required).length} mandatory, ${t.columns.filter((c) => c.allowed).length} with dropdowns, warnings: ${t.warnings.join(', ') || 'none'}`);
    for (const c of t.columns) {
      console.log(`   ${c.letter.padEnd(3)} ${c.required ? '*' : ' '} ${c.header.slice(0, 50).padEnd(50)} → ${(c.field ?? '—').padEnd(18)} ${c.allowed ? `[${c.allowed.length} options: ${c.allowed.slice(0, 4).join(' | ')}${c.allowed.length > 4 ? ' …' : ''}]` : c.dependentList ? '[dependent list]' : ''}`);
    }
    for (const n of [1, 10]) {
      const { rows, report } = await fillRows('check', t, marketplace, Array.from({ length: n }, (_, i) => sample(i + 1)), {
        brand: 'Generic', manufacturerName: 'Sample Textiles', manufacturerAddress: 'Ring Road, Surat, Gujarat 395002', countryOfOrigin: 'India',
      }, { useCacheAndAi: false });
      const writes: CellWrite[] = [];
      rows.forEach((row, i) => {
        for (const [col, cell] of Object.entries(row.cells)) {
          if (!cell.value) continue;
          const column = t.columns.find((c) => c.col === Number(col));
          const numeric = column?.field && ['mrp', 'price', 'stock', 'net_quantity', 'gst'].includes(column.field) && /^\d+(\.\d+)?$/.test(cell.value);
          writes.push({ row: t.firstEmptyRow + i, col: Number(col), value: numeric ? Number(cell.value) : cell.value });
        }
      });
      const out = await writeCells(working, t.sheetPath, writes);
      const outName = file.replace(/\.(xlsx|xls|xlsm)$/i, `-filled-${n}.${t.outputFormat}`);
      writeFileSync(path.join(dir, outName), out);
      if (n === 1) {
        console.log(`  filled ${report.filledPercent}% of mandatory cells; still empty: ${report.emptyMandatory.map((m) => m.header).join(', ') || 'none'}`);
        if (report.adjusted.length) console.log(`  fitted to dropdowns: ${report.adjusted.map((a) => `${a.header}: ${a.from} → ${a.to}`).join('; ')}`);
      }
      console.log(`  wrote ${outName}`);
    }
  } catch (err: any) {
    console.log(`  FAILED: ${err?.message}`);
  }
}
