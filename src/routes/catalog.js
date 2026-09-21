import fs from 'fs';
import path from 'path';
import express from 'express';
import { parsePriceList } from '../priceList.js';
import { CATEGORIES } from '../categorize.js';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export default function catalogRoutes(store) {
  const router = express.Router();

  // Whole catalog in one payload (~200 KB). The browser filters it locally,
  // which is what makes search instant. ETag = file mtime+size, so the browser
  // re-downloads only after the Excel actually changes.
  router.get('/catalog', async (req, res) => {
    try {
      const current = await store.get();
      if (!current) {
        return res.json({ success: true, empty: true, error: store.lastError() });
      }
      const etag = `"${current.file}-${current.mtimeMs}-${current.size}"`;
      res.set('ETag', etag);
      res.set('Cache-Control', 'no-cache');
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      const { meta, items } = current.data;
      res.json({
        success: true,
        file: current.file,
        modified: new Date(current.mtimeMs).toISOString(),
        error: store.lastError(),
        categories: CATEGORIES,
        meta,
        items,
      });
    } catch (error) {
      console.error('GET /api/catalog failed:', error.message);
      res.status(500).json({ success: false, message: 'Could not load the price list', error: error.message });
    }
  });

  // Info for the Price List page: active file, other files, and the sanity-check warnings.
  router.get('/price-list', async (req, res) => {
    try {
      const current = await store.get();
      const files = store.files().map(({ mtimeMs, ...f }) => ({ ...f, active: current ? f.name === current.file : false }));
      res.json({
        success: true,
        active: current
          ? {
              file: current.file,
              modified: new Date(current.mtimeMs).toISOString(),
              size: current.size,
              meta: current.data.meta,
              warnings: current.data.warnings,
            }
          : null,
        error: store.lastError(),
        files,
      });
    } catch (error) {
      console.error('GET /api/price-list failed:', error.message);
      res.status(500).json({ success: false, message: 'Could not read the price list info', error: error.message });
    }
  });

  router.get('/price-list/download', async (req, res) => {
    const current = await store.get();
    if (!current) return res.status(404).json({ success: false, message: 'No price list has been uploaded yet' });
    res.download(path.join(store.dir, current.file), current.file);
  });

  // Replace the price list: body is the raw .xlsx, original filename in X-Filename.
  // The file is fully parsed BEFORE it is saved, so a wrong/broken file is
  // rejected and never replaces the working list. Older files are kept.
  router.post(
    '/price-list',
    express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
    async (req, res) => {
      try {
        const buffer = req.body;
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
          return res.status(400).json({ success: false, message: 'No file received' });
        }
        // .xlsx files are zip archives and start with "PK"
        if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
          return res.status(400).json({ success: false, message: 'That is not an Excel .xlsx file (older .xls files must be re-saved as .xlsx first)' });
        }

        let originalName = 'price-list.xlsx';
        try {
          originalName = decodeURIComponent(String(req.headers['x-filename'] || originalName));
        } catch {
          /* keep default */
        }
        const base = path.basename(originalName).replace(/[^\w .()\-]/g, '_').replace(/^\.+/, '');
        const fileName = /\.xlsx$/i.test(base) ? base : `${base || 'price-list'}.xlsx`;

        let parsed;
        try {
          parsed = await parsePriceList(buffer);
        } catch (err) {
          return res.status(400).json({ success: false, message: err.message });
        }

        fs.mkdirSync(store.dir, { recursive: true });
        fs.writeFileSync(path.join(store.dir, fileName), buffer);
        const current = await store.get();
        res.status(201).json({
          success: true,
          file: fileName,
          productCount: parsed.items.length,
          listDate: parsed.meta.listDateText,
          active: current ? current.file === fileName : false,
        });
      } catch (error) {
        console.error('POST /api/price-list failed:', error.message);
        res.status(500).json({ success: false, message: 'Could not save the price list', error: error.message });
      }
    }
  );

  return router;
}
