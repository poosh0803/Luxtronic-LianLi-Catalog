// Reads the Encomtech "Lian Li Products Price List" .xlsx and turns it into
// clean catalog items. The spreadsheet is the only data store: this module
// re-parses it whenever the file on disk changes (see getCatalog()).
//
// The sheet layout (as of the 9.09.2026 list):
//   rows 1-7    supplier details, list title + date, "price subject to change" notice
//   MODEL row   column headers, followed by a units row (CM / KG / QTY ...)
//   below that  one product per row; a blank row separates each product family
//               (e.g. Black/White variants); a few one-cell rows like "WIRELESS"
//               act as section headings.

import fs from 'fs';
import path from 'path';
import { readSheet } from 'read-excel-file/node';
import { categorize, detectColor } from './categorize.js';

// header text in the sheet -> field name. Matching is by header text, not by
// column position, so re-ordered columns in a future list still work.
const COLUMN_ALIASES = {
  model: ['model'],
  description: ['product description', 'description'],
  priceEx: ['price ex', 'price ex gst'],
  priceInc: ['price in', 'price inc', 'price inc gst'],
  msrp: ['msrp', 'rrp'],
  size: ['size'],
  grossKg: ['gross/w', 'gross w', 'gross weight'],
  cartonQty: ['carton'],
  ean: ['en code', 'ean code', 'ean', 'barcode'],
  eta: ['note', 'eta', 'stock'],
  warranty: ['warranty'],
  palletQty: ['pallet'],
};
const REQUIRED_COLUMNS = ['model', 'description', 'priceEx'];
const GST = 1.1;

const clean = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const round2 = (n) => Math.round(n * 100) / 100;

function toMoney(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

// "9.09.2026" / "21.09.2026" / "6.10.2026" (day.month.year) -> "2026-09-09"
function parseDotDate(text) {
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(String(text).trim());
  if (!m) return null;
  const [, d, mo, y] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function readStock(raw) {
  const text = clean(raw);
  if (!text) return { stock: 'unknown', eta: '', etaDate: null };
  if (/^in stock$/i.test(text)) return { stock: 'in-stock', eta: 'In stock', etaDate: null };
  if (raw instanceof Date) {
    const iso = raw.toISOString().slice(0, 10);
    return { stock: 'incoming', eta: iso, etaDate: iso };
  }
  const iso = parseDotDate(text);
  if (iso) return { stock: 'incoming', eta: text, etaDate: iso };
  return { stock: 'incoming', eta: text, etaDate: null }; // e.g. "MID OCT"
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    if (clean(rows[i][0]).toLowerCase() === 'model') return i;
  }
  return -1;
}

function mapColumns(headerRow) {
  const columns = {};
  headerRow.forEach((cell, index) => {
    const text = clean(cell).toLowerCase();
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (columns[field] === undefined && aliases.includes(text)) columns[field] = index;
    }
  });
  return columns;
}

function readMeta(rows, headerIndex) {
  const lines = [];
  let listDate = null;
  let listDateText = '';
  for (let i = 0; i < headerIndex; i++) {
    for (const cell of rows[i]) {
      if (cell instanceof Date) {
        listDate = cell.toISOString().slice(0, 10);
        listDateText = listDate;
        continue;
      }
      const text = clean(cell);
      if (!text) continue;
      const iso = parseDotDate(text);
      if (iso) {
        listDate = iso;
        listDateText = text;
      } else {
        lines.push(text);
      }
    }
  }
  return {
    supplier: lines[0] || '',
    title: lines.find((l) => /price list/i.test(l)) || 'Price List',
    notice: lines.find((l) => /subject to change|fluctuation/i.test(l)) || '',
    contact: lines.filter((l) => /tel|@|abn|level|street|unit/i.test(l)),
    listDate,
    listDateText,
  };
}

/**
 * Parse a price list workbook (file path or Buffer).
 * Returns { meta, items, warnings }. Throws Error with a plain-English
 * message if the file doesn't look like a price list.
 */
export async function parsePriceList(input) {
  let rows;
  try {
    rows = await readSheet(input);
  } catch (err) {
    throw new Error(`Could not read the file as an Excel (.xlsx) workbook: ${err.message}`);
  }

  const headerIndex = findHeaderRow(rows);
  if (headerIndex === -1) {
    throw new Error('Could not find the "MODEL" header row - is this the Lian Li price list?');
  }
  const columns = mapColumns(rows[headerIndex]);
  const missing = REQUIRED_COLUMNS.filter((f) => columns[f] === undefined);
  if (missing.length) {
    throw new Error(`The price list is missing required column(s): ${missing.join(', ')}.`);
  }

  const get = (row, field) => (columns[field] === undefined ? null : row[columns[field]]);
  const meta = readMeta(rows, headerIndex);

  const items = [];
  const warnings = [];
  let section = '';
  let group = 0;
  let groupHasItems = false;
  const breakGroup = () => {
    if (groupHasItems) group += 1;
    groupHasItems = false;
  };

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1; // 1-based, matches the row number shown in Excel
    const model = clean(get(row, 'model'));
    const description = clean(get(row, 'description'));

    if (!model) {
      // A row with only text in the description column is a section heading
      // ("WIRELESS", "NEW FLEX Seris"). Anything else without a model
      // (blank rows, stray zeros, the units row) just separates families.
      const others = row.some((c, idx) => idx !== columns.description && clean(c));
      if (description && !others) section = description;
      breakGroup();
      continue;
    }

    const priceEx = toMoney(get(row, 'priceEx'));
    const priceInc = toMoney(get(row, 'priceInc'));
    const msrp = toMoney(get(row, 'msrp'));
    const eanDigits = clean(get(row, 'ean')).replace(/\D/g, '');
    const stockInfo = readStock(get(row, 'eta'));
    const category = categorize(model, description);
    const warrantyRaw = clean(get(row, 'warranty'));

    const item = {
      id: rowNumber,
      row: rowNumber,
      model,
      description,
      category,
      color: detectColor(description, model),
      section,
      group,
      priceEx,
      priceInc: priceInc ?? (priceEx ? round2(priceEx * GST) : null),
      msrp,
      size: clean(get(row, 'size')),
      grossKg: toNumber(get(row, 'grossKg')),
      cartonQty: toNumber(get(row, 'cartonQty')),
      ean: eanDigits,
      ...stockInfo,
      warranty: warrantyRaw,
      palletQty: toNumber(get(row, 'palletQty')),
    };
    items.push(item);
    groupHasItems = true;

    // -- sanity checks, shown on the Price List page so the Excel can be fixed
    if (priceEx === null) warnings.push({ level: 'error', row: rowNumber, model, text: 'No Price EX' });
    if (msrp === null) warnings.push({ level: 'warn', row: rowNumber, model, text: 'No MSRP' });
    if (priceEx !== null && priceInc !== null && Math.abs(priceEx * GST - priceInc) > 0.02) {
      warnings.push({
        level: 'warn',
        row: rowNumber,
        model,
        text: `Price IN (${priceInc}) is not Price EX + 10% GST (${round2(priceEx * GST)})`,
      });
    }
    if (priceInc !== null && msrp !== null && msrp < priceInc) {
      warnings.push({
        level: 'warn',
        row: rowNumber,
        model,
        text: `MSRP ($${msrp}) is lower than Price IN ($${priceInc}) - selling at MSRP loses money`,
      });
    }
    if (stockInfo.stock === 'unknown') {
      warnings.push({ level: 'info', row: rowNumber, model, text: 'Stock / ETA column is blank' });
    }
    if (!eanDigits) warnings.push({ level: 'info', row: rowNumber, model, text: 'No EAN code' });
  }

  // duplicate model codes
  const seen = new Map();
  for (const it of items) {
    const key = it.model.toLowerCase();
    if (seen.has(key)) {
      warnings.push({
        level: 'error',
        row: it.row,
        model: it.model,
        text: `Model code also appears on row ${seen.get(key)}`,
      });
    } else {
      seen.set(key, it.row);
    }
  }

  if (items.length === 0) throw new Error('The price list has a header but no product rows.');

  warnings.sort((a, b) => a.row - b.row);
  return { meta: { ...meta, productCount: items.length }, items, warnings };
}

// ---------------------------------------------------------------------------
// Active file + cache
// ---------------------------------------------------------------------------

export function listPriceListFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /\.xlsx$/i.test(name) && !name.startsWith('~$') && !name.startsWith('.'))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, size: stat.size, modified: stat.mtime.toISOString(), mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first; the first one is active
}

export function createCatalogStore(dir) {
  let cache = null; // { file, mtimeMs, size, data }
  let inflight = null;
  let lastError = null;

  async function load() {
    const files = listPriceListFiles(dir);
    if (files.length === 0) {
      cache = null;
      lastError = null;
      return null;
    }
    // Try the newest file first; if it can't be parsed (half-saved, wrong
    // file) keep serving the last good data and report the problem.
    const active = files[0];
    if (cache && cache.file === active.name && cache.mtimeMs === active.mtimeMs && cache.size === active.size) {
      lastError = null; // the newest file is the one already loaded, so any earlier failure is gone
      return cache;
    }
    try {
      const data = await parsePriceList(path.join(dir, active.name));
      cache = { file: active.name, mtimeMs: active.mtimeMs, size: active.size, data };
      lastError = null;
    } catch (err) {
      lastError = { file: active.name, message: err.message };
      console.error(`Price list "${active.name}" could not be loaded: ${err.message}`);
    }
    return cache;
  }

  return {
    // Returns { file, modified, data } for the current price list, or null.
    async get() {
      if (!inflight) inflight = load().finally(() => { inflight = null; });
      const c = await inflight;
      return c ? { file: c.file, mtimeMs: c.mtimeMs, size: c.size, data: c.data } : null;
    },
    lastError: () => lastError,
    files: () => listPriceListFiles(dir),
    dir,
  };
}
