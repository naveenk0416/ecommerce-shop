/**
 * Bulk template fill (Meesho / Flipkart) — against a throwaway in-memory MongoDB with a fake
 * Gemini. The templates are built here to look like the real ones (instruction sheets, title
 * rows, "*" and "Mandatory" markers, dropdowns on hidden sheets incl. Excel's x14 form, an .xls
 * and an .xlsm with a macro part). The real downloaded templates are checked separately.
 */
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

let mongo: MongoMemoryServer;
let server: Server;
let base = '';
let common: any;
let jwt: any;
let geminiCalls = 0;
let geminiAnswer: (prompt: string) => Array<{ id: string; value: string }> = () => [];

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['MONGO_URI'] = mongo.getUri();
  process.env['VERCEL'] = '1';
  process.env['JWT_SECRET'] = 'test-secret';
  process.env['PUBLIC_API_URL'] = 'https://api.sellassist.in';
  for (const key of ['GEMINI_API_KEY', 'RESEND_API_KEY', 'TRUST_PROXY']) process.env[key] = '';
  common = await import('../api/common.js');
  await common.ensureConnected();
  const mongoose = (await import('mongoose')).default;
  assert.match(mongoose.connection.host, /^(127\.0\.0\.1|localhost)$/, 'refusing to run against a non-local database');
  (await import('../utils/gemini.js')).setGeminiGeneratorForTests(async (req: any) => {
    geminiCalls += 1;
    return { text: JSON.stringify({ answers: geminiAnswer(req.prompt) }), inputTokens: 500, outputTokens: 100 };
  });
  jwt = (await import('jsonwebtoken')).default;
  const app = (await import('../server.js')).default;
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(async () => {
  server?.close();
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(() => {
  geminiCalls = 0;
  // Fake AI: "Sleeve Length" → three-quarter when the product text says 3/4.
  geminiAnswer = (prompt) => {
    const data = JSON.parse(prompt.slice(prompt.indexOf('[')));
    const out: Array<{ id: string; value: string }> = [];
    for (const column of data) {
      for (const cell of column.cells) {
        if (/sleeve/i.test(column.column) && /3\/4|three-quarter/i.test(cell.product)) out.push({ id: cell.id, value: 'Three-Quarter Sleeves' });
        if (/neck/i.test(column.column)) out.push({ id: cell.id, value: 'Not in the list' });
      }
    }
    return out;
  };
});

// ---------------- Templates that look like the real ones ----------------

async function meeshoKurtis(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const help = wb.addWorksheet('Instructions');
  help.getCell('A1').value = 'How to fill this template: fill one product per row. Fields marked * are mandatory.';
  const ws = wb.addWorksheet('Kurtis');
  const values = wb.addWorksheet('Values', { state: 'hidden' });
  ['Color', 'Black', 'Blue', 'Red', 'Multicolor'].forEach((v, i) => { values.getCell(i + 1, 1).value = v; });
  ['Fabric', 'Cotton', 'Rayon', 'Silk'].forEach((v, i) => { values.getCell(i + 1, 2).value = v; });
  ['Sleeve', 'Short Sleeves', 'Three-Quarter Sleeves', 'Long Sleeves', 'Sleeveless'].forEach((v, i) => { values.getCell(i + 1, 3).value = v; });
  ['GST', '0', '3', '5', '12', '18'].forEach((v, i) => { values.getCell(i + 1, 4).value = v; });
  ['Country', 'India', 'China', 'Bangladesh'].forEach((v, i) => { values.getCell(i + 1, 5).value = v; });
  wb.definedNames.add('Values!$E$2:$E$4', 'CountryList');

  ws.getCell('A1').value = 'Meesho Bulk Catalog Upload — Kurtis';
  const headers = ['Product Name *', 'Meesho Price *', 'Product MRP *', 'Inventory *', 'GST % *', 'HSN ID *', 'Product Weight (gms) *',
    'Color *', 'Fabric *', 'Sleeve Length', 'Neck', 'Occasion', 'Country of Origin *', 'Manufacturer Details *', 'Packer Details *',
    'Brand Name', 'Product ID / Style ID', 'Image 1 (Front) *', 'Image 2', 'Size Chart', 'Product Description'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: h.includes('*') ? 'FFFF0000' : 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    ws.getCell(4, i + 1).value = h.includes('*') ? 'Mandatory' : 'Optional';
  });
  ws.getColumn(2).numFmt = '0';
  const list = (col: number, formula: string) => {
    for (let r = 5; r <= 30; r++) ws.getCell(r, col).dataValidation = { type: 'list', allowBlank: true, formulae: [formula] };
  };
  list(5, 'Values!$D$2:$D$6');
  list(8, 'Values!$A$2:$A$5');
  list(9, 'Values!$B$2:$B$4');
  list(12, '"Casual,Festive,Party,Formal"');
  list(13, 'CountryList');
  const buf = Buffer.from(await wb.xlsx.writeBuffer());

  // Sleeve + Neck as Excel's x14 validations (how real templates reference hidden sheets).
  const zip = await JSZip.loadAsync(buf);
  const sheetPath = 'xl/worksheets/sheet2.xml';
  let xml = await zip.file(sheetPath)!.async('string');
  const ext = '<extLst><ext uri="{CCE6A557-97BC-4b89-ADB6-D9C93CAAB3DF}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main">'
    + '<x14:dataValidations count="2" xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">'
    + '<x14:dataValidation type="list" allowBlank="1"><x14:formula1><xm:f>Values!$C$2:$C$5</xm:f></x14:formula1><xm:sqref>J5:J1000</xm:sqref></x14:dataValidation>'
    + '<x14:dataValidation type="list" allowBlank="1"><x14:formula1><xm:f>\'Values\'!$C$2:$C$3</xm:f></x14:formula1><xm:sqref>K5:K1000</xm:sqref></x14:dataValidation>'
    + '</x14:dataValidations></ext></extLst>';
  xml = xml.replace('</worksheet>', `${ext}</worksheet>`);
  zip.file(sheetPath, xml);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function flipkartKurta(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Read Me').getCell('A1').value = 'Flipkart listing template. Row 4 shows Required / Optional.';
  const ws = wb.addWorksheet('kurta');
  const lists = wb.addWorksheet('lists', { state: 'veryHidden' });
  ['GST_0', 'GST_5', 'GST_12', 'GST_18', 'GST_APPAREL'].forEach((v, i) => { lists.getCell(i + 1, 1).value = v; });
  ['Generic', 'Fabindia', 'Biba'].forEach((v, i) => { lists.getCell(i + 1, 2).value = v; });
  ws.getCell('A1').value = 'Listing Information';
  ws.mergeCells('A1:E1');
  const headers = ['Seller SKU ID', 'MRP (INR)', 'Your selling price (INR)', 'Stock', 'HSN', 'Tax Code', 'Brand', 'Style Code', 'Color',
    'Fabric', 'Pattern', 'Ideal For', 'Main Image URL', 'Other Image URL 1', 'Key Features', 'Description', 'Manufacturer Details',
    'Packer Details', 'Country Of Origin', 'Package Weight (KG)', 'Package Length (CM)', 'EAN/UPC'];
  headers.forEach((h, i) => {
    ws.getCell(2, i + 1).value = h;
    ws.getCell(3, i + 1).value = `Please enter the ${h.toLowerCase()} for this listing as shown on the product`;
    ws.getCell(4, i + 1).value = ['Seller SKU ID', 'MRP (INR)', 'Your selling price (INR)', 'Stock', 'HSN', 'Tax Code', 'Brand', 'Color', 'Main Image URL', 'Package Weight (KG)'].includes(h) ? 'Required' : 'Optional';
  });
  for (let r = 5; r <= 30; r++) {
    ws.getCell(r, 6).dataValidation = { type: 'list', allowBlank: true, formulae: ['lists!$A$1:$A$5'] };
    ws.getCell(r, 7).dataValidation = { type: 'list', allowBlank: true, formulae: ['lists!$B$1:$B$3'] };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------- Helpers ----------------

async function seller(profile?: Record<string, unknown>) {
  const user = await new common.User({ email: `b${crypto.randomBytes(4).toString('hex')}@example.test`, passwordHash: 'x', emailVerified: true, sellerProfile: profile }).save();
  return { uid: user._id.toString(), token: jwt.sign({ uid: user._id.toString(), email: user.email }, 'test-secret') as string };
}

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const buf = Buffer.from(await res.arrayBuffer());
  let data: any = buf;
  try { data = JSON.parse(buf.toString('utf8')); } catch { /* binary */ }
  return { status: res.status, data, headers: res.headers };
}

async function upload(token: string, file: Buffer, marketplace: 'meesho' | 'flipkart', name = 'template.xlsx') {
  const res = await fetch(`${base}/bulk/templates?marketplace=${marketplace}&name=${encodeURIComponent(name)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: file,
  });
  return { status: res.status, data: await res.json() as any };
}

const v = (value: string) => ({ values: [value], confidence: 90, reason: '' });

async function kurtiListing(uid: string, opts: { inventory?: boolean; category?: string } = {}) {
  const draft = await common.ListingDraft.create({
    uid,
    title: 'Pink cotton kurti',
    image: 'data:image/jpeg;base64,aGVsbG8=',
    results: {
      general: { productTitle: v('Pink Cotton Kurti'), category: v(opts.category ?? 'Women > Ethnic Wear > Kurtis'), hsnCode: v('6104'), description: v('Pink cotton kurti with 3/4 sleeves and floral print.') },
      meesho: { listingTitle: v('Women Pink Cotton Kurti 3/4 Sleeve'), description: v('Soft cotton kurti, 3/4 sleeves.'), color: v('Navy Blue'), size: v('M') },
      flipkart: { seoTitle: v('Women Printed Cotton Straight Kurta (Pink)'), keyHighlight1: v('Pure cotton'), keyHighlight2: v('3/4 sleeves'), description: v('Straight cotton kurta.'), material: v('Cotton'), color: v('Pink') },
      amazon: { material: v('Cotton') },
    },
  });
  if (opts.inventory) {
    await common.Listing.create({ uid, name: 'Pink cotton kurti', sellingPrice: 499, mrp: 999, quantity: 12, gstRate: 5, hsnCode: '6104', sku: 'KURTI-PINK-M', draftId: draft._id.toString() });
  }
  return draft._id.toString();
}

// ---------------- Tests ----------------

test('file type is checked by content: PDF renamed .xlsx, random zip and empty body are rejected', async () => {
  const { token } = await seller();
  const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj << >> endobj');
  assert.equal((await upload(token, pdf, 'meesho', 'catalog.xlsx')).data.code, 'BAD_FILE');
  const zip = new JSZip(); zip.file('hello.txt', 'hi');
  assert.equal((await upload(token, await zip.generateAsync({ type: 'nodebuffer' }), 'meesho')).data.code, 'BAD_FILE');
  assert.equal((await upload(token, Buffer.alloc(0), 'meesho')).status, 400);
  const big = Buffer.alloc(10 * 1024 * 1024 + 10, 1);
  assert.equal((await upload(token, big, 'meesho')).status, 413);
});

test('Meesho-style template: data sheet, header row, mandatory markers and dropdowns (incl. hidden sheet, defined name, x14)', async () => {
  const { token } = await seller();
  const res = await upload(token, await meeshoKurtis(), 'meesho', 'Kurtis.xlsx');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const t = res.data;
  assert.equal(t.sheetName, 'Kurtis');
  assert.equal(t.category, 'Kurtis');
  assert.equal(t.headerRow, 3);
  assert.equal(t.firstRow, 5, 'the Mandatory/Optional row is skipped');
  const col = (h: string) => t.columns.find((c: any) => c.header.startsWith(h));
  assert.equal(col('Product Name').field, 'title');
  assert.equal(col('Product Name').required, true);
  assert.equal(col('Neck').required, false);
  assert.deepEqual(col('Color').allowed, ['Black', 'Blue', 'Red', 'Multicolor']);
  assert.deepEqual(col('Occasion').allowed, ['Casual', 'Festive', 'Party', 'Formal']);
  assert.deepEqual(col('Country of Origin').allowed, ['India', 'China', 'Bangladesh'], 'defined-name list');
  assert.deepEqual(col('Sleeve Length').allowed, ['Short Sleeves', 'Three-Quarter Sleeves', 'Long Sleeves', 'Sleeveless'], 'x14 list on a hidden sheet');
  assert.equal(col('Product Weight').neverInvent, true);
  assert.equal(col('Size Chart').neverInvent, true);
});

test('fill: marketplace title, inventory price/stock/SKU, GST in the template format, dropdown fitting, one AI call, never-invent fields left empty', async () => {
  const { uid, token } = await seller({ brand: 'Rangoli', manufacturerName: 'Rangoli Textiles', manufacturerAddress: 'Ring Road, Surat 395002', countryOfOrigin: 'India' });
  const withInventory = await kurtiListing(uid, { inventory: true });
  const draftOnly = await kurtiListing(uid);
  const t = (await upload(token, await meeshoKurtis(), 'meesho')).data;
  const fill = await api('POST', `/bulk/templates/${t.id}/fill`, { draftIds: [withInventory, draftOnly] }, token);
  assert.equal(fill.status, 200, JSON.stringify(fill.data));
  const { rows, report } = fill.data;
  const byHeader = (row: any, h: string) => row.cells[t.columns.find((c: any) => c.header.startsWith(h)).col];
  const r0 = rows[0];
  assert.equal(byHeader(r0, 'Product Name').value, 'Women Pink Cotton Kurti 3/4 Sleeve', 'Meesho title from the Meesho tab');
  assert.equal(byHeader(r0, 'Meesho Price').value, '499');
  assert.equal(byHeader(r0, 'Product MRP').value, '999');
  assert.equal(byHeader(r0, 'Inventory').value, '12');
  assert.equal(byHeader(r0, 'GST %').value, '5');
  assert.equal(byHeader(r0, 'HSN ID').value, '6104');
  assert.deepEqual(byHeader(r0, 'Color'), { value: 'Blue', status: 'adjusted', from: 'Navy Blue' }, 'fitted to the dropdown');
  assert.equal(byHeader(r0, 'Fabric').value, 'Cotton');
  assert.deepEqual(byHeader(r0, 'Sleeve Length'), { value: 'Three-Quarter Sleeves', status: 'ai' });
  assert.equal(byHeader(r0, 'Neck').value, '', 'AI answers outside the list are dropped');
  assert.equal(byHeader(r0, 'Country of Origin').value, 'India');
  assert.equal(byHeader(r0, 'Manufacturer Details').value, 'Rangoli Textiles, Ring Road, Surat 395002');
  assert.equal(byHeader(r0, 'Packer Details').value, 'Rangoli Textiles, Ring Road, Surat 395002', 'packer falls back to the manufacturer');
  assert.equal(byHeader(r0, 'Brand Name').value, 'Rangoli');
  assert.equal(byHeader(r0, 'Product ID / Style ID').value, 'KURTI-PINK-M');
  assert.match(byHeader(r0, 'Image 1').value, /^https:\/\/api\.sellassist\.in\/api\/drafts\/[a-f0-9]{24}\/image\.jpg/);
  assert.deepEqual(byHeader(r0, 'Product Weight'), { value: '', status: 'must_fill' }, 'weight is never invented');
  assert.equal(byHeader(r0, 'Size Chart').value, '');
  // No inventory → no price/stock (never taken from AI suggestions).
  assert.equal(byHeader(rows[1], 'Meesho Price').status, 'must_fill');
  assert.equal(byHeader(rows[1], 'Product ID / Style ID').value, `SA-${draftOnly}`);
  assert.equal(geminiCalls, 1, 'one AI call for the whole file');
  assert.ok(report.emptyMandatory.some((m: any) => /Product Weight/.test(m.header) && m.rows === 2));
  assert.ok(report.adjusted.some((a: any) => a.from === 'Navy Blue' && a.to === 'Blue'));
  assert.ok(report.instructions.includes('SAVE_TO_INVENTORY_FOR_PRICE'));

  // Same category template again → answers come from the cache: zero AI calls.
  const t2 = (await upload(token, await meeshoKurtis(), 'meesho')).data;
  await api('POST', `/bulk/templates/${t2.id}/fill`, { draftIds: [withInventory, draftOnly] }, token);
  assert.equal(geminiCalls, 1, 'cached by template hash');
});

test('Flipkart-style template: Required row, tax code GST_APPAREL, brand dropdown, key features, image URL', async () => {
  const { uid, token } = await seller({ brand: 'Biba' });
  const id = await kurtiListing(uid, { inventory: true });
  const t = (await upload(token, await flipkartKurta(), 'flipkart', 'kurta.xlsx')).data;
  assert.equal(t.sheetName, 'kurta');
  assert.equal(t.headerRow, 2);
  assert.equal(t.firstRow, 5, 'description + Required rows skipped');
  const col = (h: string) => t.columns.find((c: any) => c.header === h);
  assert.equal(col('Tax Code').required, true);
  assert.equal(col('Pattern').required, false);
  const fill = await api('POST', `/bulk/templates/${t.id}/fill`, { draftIds: [id] }, token);
  const cells = fill.data.rows[0].cells;
  assert.equal(cells[col('Tax Code').col].value, 'GST_APPAREL');
  assert.equal(cells[col('Brand').col].value, 'Biba');
  assert.equal(cells[col('Seller SKU ID').col].value, 'KURTI-PINK-M');
  assert.equal(cells[col('Key Features').col].value, 'Pure cotton\n3/4 sleeves');
  assert.match(cells[col('Main Image URL').col].value, /^https:\/\//);
  assert.equal(cells[col('Other Image URL 1').col].value, '', 'we only have one photo');
  assert.equal(cells[col('EAN/UPC').col].value, '');
  assert.equal(cells[col('Package Weight (KG)').col].status, 'must_fill');
  assert.equal(cells[col('Description').col].value, 'Straight cotton kurta.');
});

test('download: same format, rows written under the header, everything else in the file untouched', async () => {
  const { uid, token } = await seller({ countryOfOrigin: 'India' });
  const id = await kurtiListing(uid, { inventory: true });
  const original = await meeshoKurtis();
  const t = (await upload(token, original, 'meesho', 'Kurtis.xlsx')).data;
  const fill = await api('POST', `/bulk/templates/${t.id}/fill`, { draftIds: [id] }, token);
  const cells = Object.fromEntries(Object.entries(fill.data.rows[0].cells).map(([k, c]: any) => [k, c.value]));
  const weightCol = t.columns.find((c: any) => c.header.startsWith('Product Weight')).col;
  cells[weightCol] = '250'; // seller edits a "You must fill" cell in the preview
  const dl = await api('POST', `/bulk/templates/${t.id}/download`, { rows: [{ cells }, { cells }] }, token);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('x-output-format'), 'xlsx');
  assert.match(dl.headers.get('content-disposition')!, /Kurtis-filled\.xlsx/);
  const out: Buffer = dl.data;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out as any);
  const ws = wb.getWorksheet('Kurtis')!;
  assert.equal(ws.getCell(5, 1).value, 'Women Pink Cotton Kurti 3/4 Sleeve');
  assert.equal(ws.getCell(6, 1).value, 'Women Pink Cotton Kurti 3/4 Sleeve');
  assert.equal(ws.getCell(5, 2).value, 499, 'prices written as numbers');
  assert.equal(ws.getCell(5, weightCol).value, 250);
  assert.equal(ws.getCell(3, 1).value, 'Product Name *', 'header untouched');
  assert.equal(ws.getCell(4, 1).value, 'Mandatory');
  assert.equal((ws.getCell(3, 1).font?.color as any)?.argb, 'FFFF0000', 'header formatting kept');
  assert.equal(wb.getWorksheet('Values')!.state, 'hidden', 'hidden sheet stays hidden');

  const [a, b] = await Promise.all([JSZip.loadAsync(original), JSZip.loadAsync(out)]);
  const changed: string[] = [];
  for (const name of Object.keys(a.files)) {
    if (a.files[name].dir) continue;
    const [x, y] = await Promise.all([a.file(name)!.async('nodebuffer'), b.file(name)?.async('nodebuffer')]);
    if (!y || !x.equals(y)) changed.push(name);
  }
  assert.deepEqual(changed, ['xl/worksheets/sheet2.xml'], 'only the data sheet changed');
  const sheet = await b.file('xl/worksheets/sheet2.xml')!.async('string');
  assert.match(sheet, /<dataValidation\b[^>]*type="list"/, 'dropdowns kept');
  assert.match(sheet, /<x14:dataValidation type="list"/, 'x14 dropdowns kept');
});

test('.xlsm keeps its macro part byte for byte; .xls comes back as .xlsx with a warning', async () => {
  const { uid, token } = await seller();
  const id = await kurtiListing(uid, { inventory: true });

  const zip = await JSZip.loadAsync(await meeshoKurtis());
  const macro = crypto.randomBytes(2048);
  zip.file('xl/vbaProject.bin', macro);
  const types = (await zip.file('[Content_Types].xml')!.async('string'))
    .replace('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', 'application/vnd.ms-excel.sheet.macroEnabled.main+xml')
    .replace('</Types>', '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>');
  zip.file('[Content_Types].xml', types);
  const xlsm = await zip.generateAsync({ type: 'nodebuffer' });
  const t = (await upload(token, xlsm, 'meesho', 'Kurtis.xlsm')).data;
  assert.equal(t.inputFormat, 'xlsm');
  assert.equal(t.outputFormat, 'xlsm');
  const fill = await api('POST', `/bulk/templates/${t.id}/fill`, { draftIds: [id] }, token);
  const cells = Object.fromEntries(Object.entries(fill.data.rows[0].cells).map(([k, c]: any) => [k, c.value]));
  const dl = await api('POST', `/bulk/templates/${t.id}/download`, { rows: [{ cells }] }, token);
  assert.match(dl.headers.get('content-disposition')!, /\.xlsm"/);
  const outZip = await JSZip.loadAsync(dl.data);
  assert.ok((await outZip.file('xl/vbaProject.bin')!.async('nodebuffer')).equals(macro), 'macro part untouched (never run)');

  // .xls (BIFF8)
  const wb = XLSX.read(await flipkartKurta(), { type: 'buffer' });
  const xls = XLSX.write(wb, { type: 'buffer', bookType: 'biff8' }) as Buffer;
  const tx = (await upload(token, xls, 'flipkart', 'kurta.xls')).data;
  assert.equal(tx.inputFormat, 'xls');
  assert.equal(tx.outputFormat, 'xlsx');
  assert.ok(tx.warnings.includes('XLS_CONVERTED'));
  const fx = await api('POST', `/bulk/templates/${tx.id}/fill`, { draftIds: [id] }, token);
  const cx = Object.fromEntries(Object.entries(fx.data.rows[0].cells).map(([k, c]: any) => [k, c.value]));
  const dx = await api('POST', `/bulk/templates/${tx.id}/download`, { rows: [{ cells: cx }] }, token);
  assert.equal(dx.status, 200);
  assert.match(dx.headers.get('content-disposition')!, /kurta-filled\.xlsx/);
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(dx.data as any);
  assert.equal(back.getWorksheet('kurta')!.getCell(5, 1).value, 'KURTI-PINK-M');
});

test('category mismatch warning, max 100 listings, 20 files a day, other sellers can\'t use my template, template expiry', async () => {
  const { uid, token } = await seller();
  const bedsheet = await kurtiListing(uid, { category: 'Home > Bed Linen > Bedsheets' });
  const kurti = await kurtiListing(uid);
  const t = (await upload(token, await meeshoKurtis(), 'meesho')).data;
  const fill = await api('POST', `/bulk/templates/${t.id}/fill`, { draftIds: [bedsheet, kurti] }, token);
  assert.equal(fill.data.rows[0].categoryMismatch, true);
  assert.equal(fill.data.rows[1].categoryMismatch, false);

  const tooMany = Array.from({ length: 101 }, () => bedsheet);
  assert.equal((await api('POST', `/bulk/templates/${t.id}/fill`, { draftIds: tooMany }, token)).status, 400);

  const other = await seller();
  assert.equal((await api('POST', `/bulk/templates/${t.id}/fill`, { draftIds: [kurti] }, other.token)).status, 404);

  await common.BulkTemplate.updateOne({ _id: t.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await api('POST', `/bulk/templates/${t.id}/fill`, { draftIds: [kurti] }, token)).data.code, 'EXPIRED');

  const file = await flipkartKurta();
  const statuses: number[] = [];
  for (let i = 0; i < 20; i++) statuses.push((await upload(token, file, 'flipkart')).status);
  assert.equal(statuses.filter((s) => s === 200).length, 19, '1 used above + 19 = 20');
  assert.equal(statuses[19], 429);
});

test('seller profile: saved once and reused; pincode validated; logs keep no file contents', async () => {
  const { uid, token } = await seller();
  assert.equal((await api('PUT', '/bulk/profile', { pickupPincode: '12345' }, token)).status, 400);
  const saved = await api('PUT', '/bulk/profile', { brand: 'Rangoli', manufacturerName: 'Rangoli Textiles', countryOfOrigin: 'India', gstHandling: 'inclusive', pickupPincode: '395002' }, token);
  assert.equal(saved.status, 200);
  assert.equal((await api('GET', '/bulk/profile', undefined, token)).data.profile.brand, 'Rangoli');

  const id = await kurtiListing(uid, { inventory: true });
  const t = (await upload(token, await flipkartKurta(), 'flipkart')).data;
  const fill = await api('POST', `/bulk/templates/${t.id}/fill`, { draftIds: [id] }, token);
  const brandCol = t.columns.find((c: any) => c.header === 'Brand').col;
  assert.deepEqual(fill.data.rows[0].cells[brandCol], { value: '', status: 'must_fill', from: 'Rangoli' }, 'a brand is never swapped for another list value');
  // No saved brand and the template allows "Generic" → Generic.
  const { uid: uid2, token: token2 } = await seller();
  const id2 = await kurtiListing(uid2, { inventory: true });
  const t2 = (await upload(token2, await flipkartKurta(), 'flipkart')).data;
  const fill2 = await api('POST', `/bulk/templates/${t2.id}/fill`, { draftIds: [id2] }, token2);
  assert.equal(fill2.data.rows[0].cells[brandCol].value, 'Generic');
  const cells = Object.fromEntries(Object.entries(fill.data.rows[0].cells).map(([k, c]: any) => [k, c.value]));
  await api('POST', `/bulk/templates/${t.id}/download`, { rows: [{ cells }] }, token);
  const log = await common.BulkFileLog.findOne({ uid }).lean();
  assert.equal(log.marketplace, 'flipkart');
  assert.equal(log.rows, 1);
  assert.equal(log.category, 'kurta');
  assert.ok(typeof log.filledPercent === 'number');
  assert.equal(JSON.stringify(log).includes('Pink'), false, 'no file contents in logs');
});

test('Meesho 2026 layout: name + long description in one header cell, label/"do not fill" columns skipped, single-option Variation, exact brands only, Group ID dropdown', async () => {
  const { parseTemplate, workingBytes } = await import('./workbook.js');
  const { fillRows } = await import('./fill.js');
  const { assignSkus, sanitizeVariants } = await import('../utils/variants.js');
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Instructions').getCell('A1').value = 'Meesho Product Uploading';
  const ws = wb.addWorksheet('Water-Bottles-Fill this');
  const lists = wb.addWorksheet('Validation Sheet', { state: 'hidden' });
  const longText = (name: string) => `\n\n${name}\n\nPlease enter the ${name.toLowerCase()} exactly as it should appear. ${'This text is long on purpose. '.repeat(4)}`;
  const cols: Array<[string, string]> = [
    ['Field Names', 'Fields + Description:'], ['Do not fill these 2 columns.', 'ERROR STATUS'], ['Do not fill these 2 columns.', 'ERROR MESSAGE'],
    ['* Compulsory Field', 'Product Name'], ['* Compulsory Field', 'Variation'], ['* Compulsory Field', 'Meesho Price'],
    ['Optional Field', 'Wrong/Defective Returns Price'], ['* Compulsory Field', 'MRP'], ['* Compulsory Field', 'Inventory'],
    ['* Compulsory Field', 'Generic Name'], ['* Compulsory Field', 'Leak Proof'], ['Optional Field', 'SKU ID'],
    ['Optional Field', 'Brand'], ['Optional Field', 'Group ID'], ['Optional Field', 'Product Description'],
  ];
  ws.getCell('A1').value = 'Water Bottles Template (Home & Kitchen)';
  cols.forEach(([marker, name], i) => {
    ws.getCell(2, i + 1).value = marker;
    ws.getCell(3, i + 1).value = i === 0 ? name : longText(name);
  });
  ws.getCell('A4').value = 'Tutorial Link';
  ws.getCell('D4').value = 'Watch Explainer Video';
  [['Free Size'], ['Water Bottles', 'Sippers'], ['Yes', 'No'], ['EAGLE WELL', 'Eagle', 'Milton'], ['Group 01', 'Group 02', 'Group 03']]
    .forEach((values, c) => values.forEach((v, r) => { lists.getCell(r + 1, c + 1).value = v; }));
  const list = (col: number, range: string) => { for (let r = 5; r <= 50; r++) ws.getCell(r, col).dataValidation = { type: 'list', allowBlank: true, formulae: [range] }; };
  list(5, "'Validation Sheet'!$A$1:$A$1");
  list(10, "'Validation Sheet'!$B$1:$B$2");
  list(11, "'Validation Sheet'!$C$1:$C$2");
  list(13, "'Validation Sheet'!$D$1:$D$3");
  list(14, "'Validation Sheet'!$E$1:$E$3");
  const buf = Buffer.from(await wb.xlsx.writeBuffer());

  const t = await parseTemplate(workingBytes(buf, 'xlsx'), 'xlsx');
  assert.equal(t.headerRow, 3);
  assert.equal(t.firstEmptyRow, 5, 'the tutorial row is not a data row');
  const byName = Object.fromEntries(t.columns.map((c) => [c.header, c]));
  assert.ok(!t.columns.some((c) => c.letter === 'A' || c.letter === 'B' || c.letter === 'C'), 'label and "do not fill" columns are skipped');
  assert.equal(byName['Product Name'].field, 'title');
  assert.equal(byName['Meesho Price'].field, 'price');
  assert.equal(byName['Wrong/Defective Returns Price'].field, 'return_price');
  assert.equal(byName['Inventory'].field, 'stock');
  assert.equal(byName['Leak Proof'].field, 'attribute');
  assert.ok(byName['Product Name'].required && byName['Inventory'].required && !byName['SKU ID'].required, '"* Compulsory Field" marks required columns');

  const f = (v: string) => ({ values: [v] });
  const plain = {
    draftId: '6abd5a62f293c5fc0136b048',
    results: { general: { productTitle: f('Kids Water Bottle'), category: f('Home > Drinkware > Water Bottles'), sellingPrice: f('249'), mrp: f('499'), stock: f('20'), description: f('Leak-proof bottle.') } },
    imageUrl: null, inventory: null,
  };
  const sized = {
    draftId: '6abd5a62f293c5fc0136b049', results: { general: { productTitle: f('Sipper'), sellingPrice: f('199') } }, imageUrl: null, inventory: null,
    variants: assignSkus('6abd5a62f293c5fc0136b049', sanitizeVariants([{ size: 'S', stock: 2 }, { size: 'M', stock: 3 }]).variants!),
    styleId: 'SA-36B049',
  };
  const { rows } = await fillRows('u', t, 'meesho', [plain, sized], { brand: 'Eagle' }, { useCacheAndAi: false });
  const cell = (row: number, name: string) => rows[row].cells[byName[name].col];
  assert.equal(cell(0, 'Product Name').value, 'Kids Water Bottle');
  assert.equal(cell(0, 'Meesho Price').value, '249', 'price from the listing when it is not in Inventory');
  assert.equal(cell(0, 'MRP').value, '499');
  assert.equal(cell(0, 'Inventory').value, '20');
  assert.equal(cell(0, 'Wrong/Defective Returns Price').value, '', 'the returns price is never the selling price');
  assert.equal(cell(0, 'Variation').value, 'Free Size', 'single-option required dropdown');
  assert.equal(cell(0, 'Generic Name').value, 'Water Bottles');
  assert.equal(cell(0, 'Brand').value, 'Eagle', 'exact brand, never the look-alike "EAGLE WELL"');
  assert.equal(cell(0, 'Product Description').value, 'Leak-proof bottle.');
  assert.equal(rows.length, 3);
  assert.equal(cell(1, 'Group ID').value, 'Group 01', 'sizes of one product share a Group ID from the dropdown');
  assert.equal(cell(2, 'Group ID').value, 'Group 01');
  assert.equal(cell(0, 'Group ID').value, '', 'a product without sizes has no group');
});

test('Flipkart .xls: overlapping merges are tolerated, "To be filled by Flipkart" columns skipped, Index "Allowed Values" + DropDownValuesForColumnN lists, Brand Color / Necklace Width / Supplier Image', async () => {
  const { parseTemplate, workingBytes } = await import('./workbook.js');
  const { detectFormat } = await import('./format.js');
  const wb = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([['Understanding Colour Codes'], ['Blue cells: Blue cells have to be mandatorily filled by you.'], ['Grey cells: Grey cells will be filled by Flipkart.']]);
  XLSX.utils.book_append_sheet(wb, summary, 'Summary Sheet');
  const index = XLSX.utils.aoa_to_sheet([
    ['Sub-categories in the file', 'Please Note', 'Allowed Values', 'Necklace Chain'],
    ['necklace_chain', '', '', 'Base Material', 'Type', 'Ideal For'],
    ['', '', '', 'Alloy', 'Chain', 'Women'],
    ['', '', '', 'Brass', 'Choker', 'Men'],
  ]);
  // Overlapping merged ranges (Excel allows them in .xls; .xlsx readers don't).
  index['!merges'] = [XLSX.utils.decode_range('A1:A4'), XLSX.utils.decode_range('A2:B3'), XLSX.utils.decode_range('B1:B2')];
  XLSX.utils.book_append_sheet(wb, index, 'Index');
  const header = ['Flipkart Serial Number', 'Catalog QC Status', 'Seller SKU ID', 'MRP (INR)', 'Your selling price (INR)', 'Stock', 'Country Of Origin',
    'Brand', 'Base Material', 'Type', 'Ideal For', 'Necklace Width', 'Brand Color', 'Main Image URL', 'Supplier Image', 'Description', 'Fullfilment by'];
  const data = XLSX.utils.aoa_to_sheet([
    header,
    header.map(() => 'Single - Text'),
    header.map((h, i) => (i < 2 ? '' : `e.g. ${h}`)),
    header.map((_, i) => (i < 2 ? 'To be filled by Flipkart' : 'Please fill this')),
  ]);
  XLSX.utils.book_append_sheet(wb, data, 'necklace_chain');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['India'], ['China']]), 'DropDownValuesForColumn6');
  wb.Workbook = { Sheets: [{}, {}, {}, { Hidden: 1 }] };
  const xls = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'biff8' }));

  assert.equal(await detectFormat(xls), 'xls');
  const t = await parseTemplate(workingBytes(xls, 'xls'), 'xls', xls);
  assert.equal(t.sheetName, 'necklace_chain');
  assert.equal(t.firstEmptyRow, 5);
  const by = Object.fromEntries(t.columns.map((c) => [c.header, c]));
  assert.ok(!by['Flipkart Serial Number'] && !by['Catalog QC Status'], '"To be filled by Flipkart" columns are skipped');
  assert.deepEqual(by['Base Material'].allowed, ['Alloy', 'Brass']);
  assert.deepEqual(by['Ideal For'].allowed, ['Women', 'Men']);
  assert.equal(by['Type'].field, 'attribute');
  assert.deepEqual(by['Country Of Origin'].allowed, ['India', 'China'], 'DropDownValuesForColumn6 → column G (0-based 6)');
  assert.equal(by['Brand Color'].field, 'color');
  assert.notEqual(by['Necklace Width'].field, 'neck');
  assert.equal(by['Brand'].field, 'brand');
  assert.ok(t.warnings.includes('XLS_CONVERTED'));
  assert.deepEqual(by['Fullfilment by'].allowed, ['seller', 'FA', 'SellerSmart'], 'Flipkart rejected a business name here — only its own values');
});
