// Quick sanity check: parse the newest price list in data/ and print a summary.
//   npm run check
import path from 'path';
import { fileURLToPath } from 'url';
import { createCatalogStore } from '../src/priceList.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const store = createCatalogStore(dir);
const cat = await store.get();
if (!cat) {
  console.log('No .xlsx found in data/', store.lastError() || '');
  process.exit(1);
}
const { meta, items, warnings } = cat.data;
console.log(cat.file);
console.log(meta);
const byCat = {};
for (const it of items) (byCat[it.category] ||= []).push(it);
for (const [c, list] of Object.entries(byCat)) console.log(`${c}: ${list.length}`);
const byStock = {};
for (const it of items) byStock[it.stock] = (byStock[it.stock] || 0) + 1;
console.log('stock', byStock);
const byColor = {};
for (const it of items) byColor[it.color || '(none)'] = (byColor[it.color || '(none)'] || 0) + 1;
console.log('color', byColor);
const lvl = {};
for (const w of warnings) lvl[w.level] = (lvl[w.level] || 0) + 1;
console.log('warnings', lvl);
if (process.argv.includes('-v')) {
  for (const w of warnings) console.log(`  [${w.level}] row ${w.row} ${w.model}: ${w.text}`);
  for (const [c, list] of Object.entries(byCat))
    if (['Accessories', 'Cables & Risers', 'Displays'].includes(c))
      for (const it of list) console.log(c.padEnd(16), it.model.padEnd(16), (it.color || '-').padEnd(6), it.description.slice(0, 60));
  console.log('NO COLOR:');
  for (const it of items.filter((i) => !i.color)) console.log('  ', it.model, '|', it.description.slice(0, 80));
}
