// Catalog page: loads the whole price list once, then searches / filters in the browser.

const state = { q: '', cat: '', stock: '', color: '', sort: 'relevance' };
let items = [];
let categories = [];
let openId = null;

const $ = (id) => document.getElementById(id);
const els = {
  listInfo: $('listInfo'),
  alerts: $('alerts'),
  controls: $('controls'),
  results: $('results'),
  searchBox: $('searchBox'),
  searchInput: $('searchInput'),
  searchClear: $('searchClear'),
  chips: $('categoryChips'),
  stock: $('stockFilter'),
  color: $('colorFilter'),
  sort: $('sortSelect'),
  resultLine: $('resultLine'),
  resetBtn: $('resetBtn'),
  rows: $('rows'),
  noResults: $('noResults'),
  overlay: $('detailOverlay'),
  box: $('detailBox'),
};

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// "PC-O11 Air" and "pco11air" should find the same thing, so model codes are
// also compared with everything except letters and digits removed.
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function prepare(item) {
  item._model = item.model.toLowerCase();
  item._sq = squash(item.model);
  item._desc = item.description.toLowerCase();
  item._hay = [item.model, item.description, item.category, item.color, item.ean, item.eta, item.size, item.section, item.warranty]
    .join(' ')
    .toLowerCase();
}

function tokenize(q) {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

// Returns a relevance score (0 = no match). Every token must match somewhere.
function scoreItem(item, tokens) {
  let total = 0;
  for (const t of tokens) {
    const sq = squash(t);
    let s = 0;
    if (item._model === t || (sq && item._sq === sq)) s = 100;
    else if (item._model.startsWith(t) || (sq && item._sq.startsWith(sq))) s = 60;
    else if (item._model.includes(t) || (sq.length >= 2 && item._sq.includes(sq))) s = 40;
    else if (item.category.toLowerCase().includes(t) && t.length >= 3) s = 20;
    else if ((' ' + item._desc).includes(' ' + t)) s = 15;
    else if (item._desc.includes(t)) s = 10;
    else if (item._hay.includes(t)) s = 5;
    if (s === 0) return 0;
    total += s;
  }
  return total;
}

function passesFilters(item, { ignoreCategory }) {
  if (!ignoreCategory && state.cat && item.category !== state.cat) return false;
  if (state.stock && item.stock !== state.stock) return false;
  if (state.color === '_none' ? item.color : state.color && item.color !== state.color) return false;
  return true;
}

function compute() {
  const tokens = tokenize(state.q);
  const scored = [];
  const counts = {};
  for (const item of items) {
    if (!passesFilters(item, { ignoreCategory: true })) continue;
    const score = tokens.length ? scoreItem(item, tokens) : 1;
    if (!score) continue;
    counts[item.category] = (counts[item.category] || 0) + 1;
    if (state.cat && item.category !== state.cat) continue;
    scored.push({ item, score });
  }

  const byPrice = (a, b, dir) => {
    const pa = a.item.priceEx, pb = b.item.priceEx;
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return (pa - pb) * dir;
  };
  scored.sort((a, b) => {
    let r = 0;
    if (state.sort === 'price-asc') r = byPrice(a, b, 1);
    else if (state.sort === 'price-desc') r = byPrice(a, b, -1);
    else if (state.sort === 'model') r = a.item.model.localeCompare(b.item.model, 'en', { numeric: true, sensitivity: 'base' });
    else if (tokens.length) r = b.score - a.score;
    return r || a.item.row - b.item.row; // otherwise keep the Excel order
  });
  return { list: scored.map((s) => s.item), counts, tokens };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function highlight(text, tokens) {
  if (!tokens.length) return escapeHtml(text);
  const pattern = tokens
    .filter((t) => t.length >= 1)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!pattern) return escapeHtml(text);
  return text
    .split(new RegExp(`(${pattern})`, 'ig'))
    .map((part, i) => (i % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
    .join('');
}

function stockBadge(item) {
  if (item.stock === 'in-stock') return '<span class="badge badge-ok">In stock</span>';
  if (item.stock === 'incoming') {
    return `<span class="badge badge-warn">Incoming</span><span class="eta">ETA ${escapeHtml(item.eta)}</span>`;
  }
  return '<span class="badge badge-grey">Ask</span><span class="eta">Not stated</span>';
}

function render() {
  const { list, counts, tokens } = compute();
  const hasFilters = state.q || state.cat || state.stock || state.color || state.sort !== 'relevance';

  // category chips (counts respect the search + other filters)
  const totalForChips = Object.values(counts).reduce((a, b) => a + b, 0);
  els.chips.innerHTML =
    chip('', 'All', totalForChips) + categories.map((c) => chip(c, c, counts[c] || 0)).join('');

  els.resultLine.textContent = `${list.length} of ${items.length} products`;
  els.resetBtn.style.display = hasFilters ? '' : 'none';
  els.searchBox.classList.toggle('has-value', !!state.q);

  els.rows.innerHTML = list
    .map(
      (it) => `
    <tr class="clickable" data-id="${it.id}" tabindex="0">
      <td class="model">${highlight(it.model, tokens)}<span class="cat-tag">${escapeHtml(it.category)}</span></td>
      <td class="desc"><div class="clamp" title="${escapeHtml(it.description)}">${highlight(it.description, tokens)}</div></td>
      <td class="stock">${stockBadge(it)}</td>
      <td class="num" data-label="Price EX">${formatMoney(it.priceEx)}</td>
      <td class="num" data-label="Price IN">${formatMoney(it.priceInc)}</td>
      <td class="num msrp" data-label="MSRP">${formatMoney(it.msrp)}</td>
    </tr>`
    )
    .join('');

  if (list.length === 0) {
    els.noResults.style.display = '';
    els.noResults.innerHTML = `<i class="fas fa-magnifying-glass"></i>No products match ${
      state.q ? `"${escapeHtml(state.q)}"` : 'these filters'
    }.<br><span style="font-size:13px">Try fewer words, or check the category, availability and colour filters.</span>`;
  } else {
    els.noResults.style.display = 'none';
  }
  els.rows.parentElement.style.display = list.length ? '' : 'none';
  syncUrl();
}

function chip(value, label, count) {
  const active = state.cat === value ? ' active' : '';
  const zero = count === 0 ? ' zero' : '';
  return `<button type="button" class="chip${active}${zero}" data-cat="${escapeHtml(value)}">${escapeHtml(label)}<span class="count">${count}</span></button>`;
}

// ---------------------------------------------------------------------------
// Detail modal
// ---------------------------------------------------------------------------

function spec(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return `<div class="spec"><span class="k">${escapeHtml(label)}</span><span class="v">${escapeHtml(value)}</span></div>`;
}

function formatEan(ean) {
  return ean.length === 13 ? `${ean.slice(0, 7)} ${ean.slice(7)}` : ean;
}

function marginInfo(item) {
  if (!item.msrp || !item.priceEx) return '';
  const msrpEx = item.msrp / 1.1;
  const profit = msrpEx - item.priceEx;
  const pct = (profit / msrpEx) * 100;
  const bad = profit < 0;
  return `<div class="price-note">Selling at MSRP: about <strong style="color:${bad ? 'var(--danger-text)' : 'inherit'}">${formatMoney(profit)} (${pct.toFixed(1)}%)</strong> margin before GST. Worked out as MSRP &divide; 1.1 &minus; Price EX.</div>`;
}

function openDetail(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  openId = id;

  const siblings = items.filter((i) => i.group === item.group);
  const variants =
    siblings.length > 1 && siblings.length <= 14
      ? `<div class="variants"><h3>Same product family in the Excel</h3>${siblings
          .map(
            (s) => `<button type="button" class="variant-row${s.id === id ? ' current' : ''}" data-open="${s.id}">
              <span class="vm">${escapeHtml(s.model)}</span>
              <span class="vd">${escapeHtml(s.description)}</span>
              <span class="vp">${formatMoney(s.msrp)}</span></button>`
          )
          .join('')}</div>`
      : '';

  const stockBadgeHtml =
    item.stock === 'in-stock'
      ? '<span class="badge badge-ok">In stock</span>'
      : item.stock === 'incoming'
        ? `<span class="badge badge-warn">Incoming - ETA ${escapeHtml(item.eta)}</span>`
        : '<span class="badge badge-grey">Stock not stated</span>';

  els.box.innerHTML = `
    <div class="modal-head">
      <h2>${escapeHtml(item.model)}</h2>
      <button type="button" class="modal-close-x" data-close title="Close (Esc)"><i class="fas fa-xmark"></i></button>
    </div>
    <div class="modal-badges">
      ${stockBadgeHtml}
      <span class="badge badge-info">${escapeHtml(item.category)}</span>
      ${item.color ? `<span class="badge badge-grey">${escapeHtml(item.color)}</span>` : ''}
    </div>
    <p class="modal-desc">${escapeHtml(item.description)}</p>

    <div class="price-cards">
      <div class="price-card"><div class="label">Price EX</div><div class="value">${formatMoney(item.priceEx)}</div></div>
      <div class="price-card"><div class="label">Price IN (incl. GST)</div><div class="value">${formatMoney(item.priceInc)}</div></div>
      <div class="price-card primary"><div class="label">MSRP</div><div class="value">${formatMoney(item.msrp)}</div></div>
    </div>
    ${marginInfo(item)}

    <div class="spec-grid">
      ${spec('EAN', item.ean ? formatEan(item.ean) : '')}
      ${spec('Warranty', item.warranty ? `${item.warranty} ${item.warranty === '1' ? 'year' : 'years'}` : '')}
      ${spec('Size (cm)', item.size)}
      ${spec('Gross weight', item.grossKg !== null ? `${item.grossKg} kg` : '')}
      ${spec('Carton qty', item.cartonQty)}
      ${spec('Pallet qty', item.palletQty)}
    </div>

    ${variants}

    <div class="source-line">From the Excel: row ${item.row}${item.section ? `, section "${escapeHtml(item.section)}"` : ''}</div>

    <div class="modal-actions">
      <button type="button" class="btn btn-primary" data-copy="model"><i class="fas fa-copy"></i> Copy model</button>
      <button type="button" class="btn" data-copy="line"><i class="fas fa-clipboard"></i> Copy model + description + MSRP</button>
      <button type="button" class="btn" data-close>Close</button>
    </div>`;

  document.body.style.overflow = 'hidden';
  els.overlay.classList.add('open');
  els.overlay.setAttribute('aria-hidden', 'false');
  els.overlay.scrollTop = 0;
  syncUrl();
}

function closeDetail() {
  openId = null;
  document.body.style.overflow = '';
  els.overlay.classList.remove('open');
  els.overlay.setAttribute('aria-hidden', 'true');
  syncUrl();
}

async function handleCopy(btn) {
  const item = items.find((i) => i.id === openId);
  if (!item) return;
  const text = btn.dataset.copy === 'model' ? item.model : `${item.model} - ${item.description} - MSRP ${formatMoney(item.msrp)}`;
  const ok = await copyText(text);
  const original = btn.innerHTML;
  btn.innerHTML = ok ? '<i class="fas fa-check"></i> Copied' : 'Copy failed';
  setTimeout(() => { btn.innerHTML = original; }, 1500);
}

// ---------------------------------------------------------------------------
// URL <-> state (so a search can be shared as a link)
// ---------------------------------------------------------------------------

function syncUrl() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.cat) p.set('cat', state.cat);
  if (state.stock) p.set('stock', state.stock);
  if (state.color) p.set('color', state.color);
  if (state.sort !== 'relevance') p.set('sort', state.sort);
  if (openId !== null) {
    const item = items.find((i) => i.id === openId);
    if (item) p.set('m', item.model);
  }
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  state.q = p.get('q') || '';
  state.cat = categories.includes(p.get('cat')) ? p.get('cat') : '';
  state.stock = ['in-stock', 'incoming', 'unknown'].includes(p.get('stock')) ? p.get('stock') : '';
  state.color = p.get('color') || '';
  state.sort = ['price-asc', 'price-desc', 'model'].includes(p.get('sort')) ? p.get('sort') : 'relevance';
  return p.get('m');
}

function applyStateToControls() {
  els.searchInput.value = state.q;
  els.stock.value = state.stock;
  els.color.value = state.color;
  els.sort.value = state.sort;
  if (els.color.value !== state.color) state.color = ''; // colour not in this list
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function buildColorOptions() {
  const order = ['Black', 'White', 'Silver', 'Grey'];
  const counts = {};
  let none = 0;
  for (const it of items) {
    if (it.color) counts[it.color] = (counts[it.color] || 0) + 1;
    else none += 1;
  }
  const names = Object.keys(counts).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  els.color.innerHTML =
    '<option value="">All</option>' +
    names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)} (${counts[n]})</option>`).join('') +
    (none ? `<option value="_none">No colour stated (${none})</option>` : '');
}

function bindEvents() {
  let timer;
  els.searchInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = els.searchInput.value.trim();
      render();
    }, 80);
  });
  els.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.searchInput.value) {
      els.searchInput.value = '';
      state.q = '';
      render();
    }
  });
  els.searchClear.addEventListener('click', () => {
    els.searchInput.value = '';
    state.q = '';
    render();
    els.searchInput.focus();
  });
  els.chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    state.cat = btn.dataset.cat;
    render();
  });
  els.stock.addEventListener('change', () => { state.stock = els.stock.value; render(); });
  els.color.addEventListener('change', () => { state.color = els.color.value; render(); });
  els.sort.addEventListener('change', () => { state.sort = els.sort.value; render(); });
  els.resetBtn.addEventListener('click', () => {
    Object.assign(state, { q: '', cat: '', stock: '', color: '', sort: 'relevance' });
    applyStateToControls();
    render();
    els.searchInput.focus();
  });

  els.rows.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) openDetail(Number(tr.dataset.id));
  });
  els.rows.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const tr = e.target.closest('tr[data-id]');
    if (tr) openDetail(Number(tr.dataset.id));
  });

  els.overlay.addEventListener('click', (e) => {
    if (e.target === els.overlay || e.target.closest('[data-close]')) return closeDetail();
    const variant = e.target.closest('[data-open]');
    if (variant) return openDetail(Number(variant.dataset.open));
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) handleCopy(copyBtn);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openId !== null) return closeDetail();
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (e.key === '/' && !typing && openId === null) {
      e.preventDefault();
      els.searchInput.focus();
      els.searchInput.select();
    }
  });
}

async function init() {
  let data;
  try {
    data = await fetchJSON('/api/catalog');
  } catch (err) {
    els.listInfo.textContent = '';
    els.alerts.innerHTML = `<div class="alert alert-danger">Could not load the price list: ${escapeHtml(err.message)}</div>`;
    return;
  }

  if (data.empty) {
    els.listInfo.textContent = '';
    els.alerts.innerHTML = `<div class="alert alert-info"><i class="fas fa-circle-info"></i> ${
      data.error
        ? `The Excel file "${escapeHtml(data.error.file)}" could not be read: ${escapeHtml(data.error.message)}`
        : 'No price list has been loaded yet.'
    } Go to <a href="/price-list">Price List</a> to upload the Excel file.</div>`;
    return;
  }

  items = data.items;
  items.forEach(prepare);
  const present = new Set(items.map((i) => i.category));
  categories = data.categories.filter((c) => present.has(c));

  const { meta } = data;
  els.listInfo.innerHTML = `${escapeHtml(meta.title)}${meta.listDateText ? ` dated <strong>${escapeHtml(meta.listDateText)}</strong>` : ''} &middot; ${escapeHtml(meta.supplier)} &middot; ${items.length} products &middot; prices in AUD`;

  let alerts = '';
  if (data.error) {
    alerts += `<div class="alert alert-danger"><i class="fas fa-triangle-exclamation"></i> The newest Excel file "${escapeHtml(data.error.file)}" could not be read (${escapeHtml(data.error.message)}). Showing the last good price list: <strong>${escapeHtml(data.file)}</strong>.</div>`;
  }
  if (meta.notice) {
    alerts += `<div class="alert alert-warn notice"><i class="fas fa-triangle-exclamation"></i><span>${escapeHtml(meta.notice)}</span></div>`;
  }
  els.alerts.innerHTML = alerts;

  buildColorOptions();
  const openModel = readUrl();
  applyStateToControls();
  els.controls.style.display = '';
  els.results.style.display = '';
  bindEvents();
  render();

  if (openModel) {
    const found = items.find((i) => i.model.toLowerCase() === openModel.toLowerCase());
    if (found) openDetail(found.id);
  }
}

init();
