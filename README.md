# Luxtronic × Lian Li Catalog

A searchable website for the Lian Li price list Excel file (Encomtech Australia).
The Excel file **is** the data store - there is no database. The server re-reads
the `.xlsx` whenever it changes, so updating prices = uploading the new Excel.

## What it does

- **Instant search** across model, description, EAN, category, colour and ETA.
  Multi-word (`o11 mini white`), punctuation-insensitive (`pco11dmiv2` finds
  `PC-O11DMIV2X`), best match first, matches highlighted.
- **Filters**: category (derived from model codes, since the sheet has none),
  availability (in stock / incoming with ETA), colour; sort by price or model.
- **Detail view** per product: Price EX / IN / MSRP, estimated margin at MSRP,
  size, weight, carton/pallet qty, EAN, warranty, sibling variants, the Excel
  row number, and copy buttons for quotes.
- Searches and open products are in the URL, so they can be shared as links.
- **Price List page**: shows the live file, uploads a new one (validated before
  it replaces anything), downloads the current Excel, and lists spreadsheet
  problems worth fixing (duplicate models, missing prices, MSRP below cost, ...).
- Dark mode toggle, phone/tablet friendly.

## Run it

```bash
npm install
cp .env.example .env
npm start            # http://localhost:3004
```

Production (LAN server): `pm2 start ecosystem.config.cjs` (process `luxtronic-lianli-catalog`).

## Updating the price list

Either:

1. Open **Price List** in the site and drop in the new `.xlsx`, or
2. Copy the new `.xlsx` into `data/` on the server.

The **most recently saved** `.xlsx` in `data/` is the live one; older files are
kept. If the newest file can't be read (half-saved, wrong file) the site keeps
showing the last good list and says so. `data/*.xlsx` is gitignored (wholesale
prices) - so a fresh `git pull` deploy starts empty until a file is uploaded.

## Expected Excel layout

Headers are matched by **name**, not column position: `MODEL`, `Product
Description`, `Price EX`, `Price IN`, `MSRP`, `SIZE`, `GROSS/W`, `CARTON`,
`EN Code`, `NOTE` (stock / ETA), `WARRANTY`, `PALLET`. `MODEL`, `Description`
and `Price EX` are required. Blank rows separate product families; one-cell rows
such as `WIRELESS` are treated as section headings.

## Layout

```
app.js                  Express entry (static files + page routes)
src/priceList.js        Excel parsing, sanity checks, "newest file wins" cache
src/categorize.js       model code -> category, colour detection (edit rules here)
src/routes/catalog.js   /api/catalog, /api/price-list (info, download, upload)
views/                  index.html (catalog), price-list.html
public/                 css/, js/ (one file per page + common.js), images/
data/                   the price list .xlsx file(s)
scripts/check-parse.js  `npm run check` - parse data/ and print a summary (-v for detail)
```

Follows `LUXTRONIC-DESIGN-GUIDELINES.md` / `LUXTRONIC-API-CONVENTIONS.md`.

## Security note

No login, by the same "LAN-only trust" choice as the other in-house apps - which
means **anyone who can reach the site can upload a price list**. Keep it on the
shop LAN; add authentication before exposing it anywhere else
(see `LUXTRONIC-PRIVACY-DATA-GUIDELINES.md`).
