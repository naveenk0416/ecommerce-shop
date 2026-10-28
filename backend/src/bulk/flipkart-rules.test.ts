/**
 * Flipkart bulk-file rules from the October 2026 review: Listing Status, Fullfilment by, gemstone
 * columns, Diamond Clarity, Model Number, brand casing, hidden characters. No database or AI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillRows, type ListingSource } from './fill.js';
import { cleanBrand, cleanCellText, listFitsSystemColumn, matchHeader } from './fields.js';
import type { ParsedTemplate, TemplateColumn } from './workbook.js';
import { withSavedBrand } from '../api/marketplace-connections.js';

function column(col: number, header: string, allowed: string[] | null = null, required = false): TemplateColumn {
  const rule = matchHeader(header);
  return { col, letter: String.fromCharCode(64 + col), header, field: rule?.key ?? (allowed ? 'attribute' : null), number: null, required, neverInvent: !!rule?.neverInvent, allowed, dependentList: false };
}

const template = (columns: TemplateColumn[]): ParsedTemplate => ({
  inputFormat: 'xlsx', outputFormat: 'xlsx', sheetName: 'necklace', sheetPath: 'xl/worksheets/sheet1.xml',
  headerRow: 1, dataStartRow: 2, firstEmptyRow: 2, category: null, columns, hash: 'test', warnings: [],
});

const f = (v: string) => ({ values: [v] });
const necklace: ListingSource = {
  draftId: '6abd5a62f293c5fc0136b048',
  results: {
    general: { productTitle: f('Gold Plated Kundan Necklace Set'), category: f('Jewellery > Necklace Sets'), description: f('Green stones with gold finish.') },
    flipkart: { color: f('Gold, Green'), brand: f('pure essentials') },
  },
  imageUrl: null, inventory: null, styleId: 'SA-36B048',
};

test('Listing Status is ACTIVE and Fullfilment by is the template\'s seller label, never product types', async () => {
  const t = template([column(1, 'Listing Status', ['ACTIVE', 'INACTIVE']), column(2, 'Fullfilment by', ['Seller'])]);
  const { rows } = await fillRows('u', t, 'flipkart', [necklace], {}, { useCacheAndAi: false });
  assert.equal(rows[0].cells[1].value, 'ACTIVE');
  assert.equal(rows[0].cells[2].value, 'Seller');
});

test('a stale "Type" list on Listing Status is not accepted as its dropdown', () => {
  assert.equal(listFitsSystemColumn('listing_status', ['Necklace', 'Necklace Set', 'Choker']), false);
  assert.equal(listFitsSystemColumn('listing_status', ['ACTIVE', 'INACTIVE']), true);
  assert.equal(listFitsSystemColumn('fulfilment', ['Seller ']), true);
});

test('gemstone colour columns stay blank without that stone; Diamond Clarity is NA', async () => {
  const t = template([
    column(1, 'Ruby Color', ['Red', 'Pink']), column(2, 'Emerald Color', ['Green']), column(3, 'Pearl Type', ['Freshwater']),
    column(4, 'Diamond Clarity', ['NA', 'VVS1', 'SI']), column(5, 'Color', ['Gold', 'Green', 'Gold, Green']),
  ]);
  const { rows } = await fillRows('u', t, 'flipkart', [necklace], {}, { useCacheAndAi: false });
  assert.equal(rows[0].cells[1].value, '');
  assert.equal(rows[0].cells[2].value, '');
  assert.equal(rows[0].cells[3].value, '');
  assert.equal(rows[0].cells[4].value, 'NA');
  assert.equal(rows[0].cells[5].value, 'Gold, Green', 'the product colour column itself is still filled');
});

test('Model Number is the design id, unique per product', async () => {
  const other = { ...necklace, draftId: '6abd5a62f293c5fc0136b049', styleId: 'SA-36B049' };
  const t = template([column(1, 'Model Number')]);
  const { rows } = await fillRows('u', t, 'flipkart', [necklace, other], {}, { useCacheAndAi: false });
  assert.deepEqual(rows.map((r) => r.cells[1].value), ['SA-36B048', 'SA-36B049']);
});

test('the saved brand is written exactly as saved, trimmed, without double or hidden spaces', async () => {
  const t = template([column(1, 'Brand', ['pure essentials', 'Generic']), column(2, 'Brand Name')]);
  const { rows } = await fillRows('u', t, 'flipkart', [necklace], { brand: '  Pure​  Essentials ' }, { useCacheAndAi: false });
  assert.equal(rows[0].cells[1].value, 'Pure Essentials');
  assert.equal(rows[0].cells[2].value, 'Pure Essentials');
});

test('hidden characters are stripped', () => {
  assert.equal(cleanCellText('﻿ seller​ '), 'seller');
  assert.equal(cleanBrand('Pure   Essentials'), 'Pure Essentials');
});

test('Flipkart sync keeps the saved brand casing at the start of a product name', () => {
  assert.equal(withSavedBrand('pure essentials steel bottle', 'Pure Essentials'), 'Pure Essentials steel bottle');
  assert.equal(withSavedBrand('pure essentialsx bottle', 'Pure Essentials'), 'pure essentialsx bottle');
  assert.equal(withSavedBrand('Other brand bottle', 'Pure Essentials'), 'Other brand bottle');
});
