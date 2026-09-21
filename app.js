import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import dotenv from 'dotenv';
import { createCatalogStore } from './src/priceList.js';
import catalogRoutes from './src/routes/catalog.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3004;
// Folder that holds the price list Excel file(s). The newest .xlsx in it is the live one.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');

const app = express();
const store = createCatalogStore(DATA_DIR);

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', catalogRoutes(store));

const page = (name) => (req, res) => res.sendFile(path.join(__dirname, 'views', `${name}.html`));
app.get('/', page('index'));
app.get('/price-list', page('price-list'));

app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Not found' }));

app.listen(PORT, () => {
  console.log(`Lian Li catalog running on http://localhost:${PORT}  (price lists in ${DATA_DIR})`);
});
