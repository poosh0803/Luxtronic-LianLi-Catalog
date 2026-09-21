// Price List page: shows the live Excel file, lets staff upload a new one,
// and lists things worth fixing in the spreadsheet.

const $ = (id) => document.getElementById(id);

const LEVEL_BADGE = { error: 'badge-danger', warn: 'badge-warn', info: 'badge-grey' };
const LEVEL_LABEL = { error: 'Error', warn: 'Check', info: 'Note' };

function renderCurrent(active, files) {
  if (!active) {
    $('currentInfo').innerHTML = '<div class="empty"><i class="fas fa-file-circle-question"></i>No price list yet. Upload the Excel file below.</div>';
    return;
  }
  const { meta } = active;
  $('currentInfo').innerHTML = `
    <div class="info-grid">
      <div><div class="k">File</div><div class="v">${escapeHtml(active.file)}</div></div>
      <div><div class="k">List date (from the sheet)</div><div class="v">${escapeHtml(meta.listDateText || '-')}</div></div>
      <div><div class="k">Products</div><div class="v">${meta.productCount}</div></div>
      <div><div class="k">File saved</div><div class="v">${formatDateTime(active.modified)}</div></div>
      <div><div class="k">Supplier</div><div class="v">${escapeHtml(meta.supplier || '-')}</div></div>
    </div>
    <div class="actions-bar">
      <a class="btn btn-primary" href="/api/price-list/download"><i class="fas fa-download"></i> Download this Excel</a>
      <a class="btn" href="/"><i class="fas fa-table-list"></i> Open catalog</a>
    </div>`;
}

function renderWarnings(active) {
  const box = $('warnings');
  if (!active) {
    box.innerHTML = '<div class="empty">Nothing to check yet.</div>';
    return;
  }
  const list = active.warnings;
  if (list.length === 0) {
    box.innerHTML = '<div class="alert alert-ok" style="margin:0"><i class="fas fa-circle-check"></i> No problems found - every product has prices, a stock status and an EAN.</div>';
    return;
  }
  const counts = { error: 0, warn: 0, info: 0 };
  list.forEach((w) => { counts[w.level] += 1; });
  box.innerHTML = `
    <p class="subtitle" style="margin-bottom:12px">These come from the checks the site runs on the spreadsheet. Fix them in Excel and upload again; the "Row" is the row number in Excel.</p>
    <div class="warn-count">
      ${counts.error ? `<span class="badge badge-danger">${counts.error} error${counts.error > 1 ? 's' : ''}</span>` : ''}
      ${counts.warn ? `<span class="badge badge-warn">${counts.warn} to check</span>` : ''}
      ${counts.info ? `<span class="badge badge-grey">${counts.info} notes</span>` : ''}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th style="width:70px">Row</th><th>Model</th><th>Issue</th><th style="width:90px"></th></tr></thead>
      <tbody>${list
        .map(
          (w) => `<tr>
            <td>${w.row}</td>
            <td><a href="/?q=${encodeURIComponent(w.model)}"><strong>${escapeHtml(w.model)}</strong></a></td>
            <td>${escapeHtml(w.text)}</td>
            <td><span class="badge ${LEVEL_BADGE[w.level]}">${LEVEL_LABEL[w.level]}</span></td></tr>`
        )
        .join('')}</tbody></table></div>`;
}

function renderFiles(files) {
  if (files.length === 0) {
    $('fileList').innerHTML = '<div class="empty">No Excel files on the server yet.</div>';
    return;
  }
  $('fileList').innerHTML = `<p class="subtitle" style="margin-bottom:12px">The most recently saved file is the one the catalog uses. Older ones are kept as a backup.</p>
    <div class="table-wrap"><table>
    <thead><tr><th>File</th><th>Saved</th><th class="num">Size</th><th></th></tr></thead>
    <tbody>${files
      .map(
        (f) => `<tr>
          <td>${escapeHtml(f.name)}</td>
          <td>${formatDateTime(f.modified)}</td>
          <td class="num">${formatBytes(f.size)}</td>
          <td>${f.active ? '<span class="badge badge-ok">Live</span>' : ''}</td></tr>`
      )
      .join('')}</tbody></table></div>`;
}

async function load() {
  try {
    const data = await fetchJSON('/api/price-list');
    $('pageAlerts').innerHTML = data.error
      ? `<div class="alert alert-danger"><i class="fas fa-triangle-exclamation"></i> The newest file "${escapeHtml(data.error.file)}" could not be read: ${escapeHtml(data.error.message)}${data.active ? ` The site is still showing <strong>${escapeHtml(data.active.file)}</strong>.` : ''}</div>`
      : '';
    renderCurrent(data.active, data.files);
    renderWarnings(data.active);
    renderFiles(data.files);
  } catch (err) {
    $('pageAlerts').innerHTML = `<div class="alert alert-danger">Could not load price list info: ${escapeHtml(err.message)}</div>`;
  }
}

async function upload(file) {
  const status = $('uploadStatus');
  if (!/\.xlsx$/i.test(file.name)) {
    status.innerHTML = '<div class="alert alert-danger" style="margin:0">Please choose an Excel .xlsx file (old .xls files need to be re-saved as .xlsx first).</div>';
    return;
  }
  status.innerHTML = `<div class="alert alert-info" style="margin:0"><i class="fas fa-spinner fa-spin"></i> Checking and uploading ${escapeHtml(file.name)}...</div>`;
  try {
    const data = await fetchJSON('/api/price-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
      body: file,
    });
    status.innerHTML = `<div class="alert alert-ok" style="margin:0"><i class="fas fa-circle-check"></i> Done. ${data.productCount} products loaded${data.listDate ? ` from the list dated ${escapeHtml(data.listDate)}` : ''}. <a href="/">Open the catalog</a></div>`;
    load();
  } catch (err) {
    status.innerHTML = `<div class="alert alert-danger" style="margin:0"><i class="fas fa-triangle-exclamation"></i> Not uploaded: ${escapeHtml(err.message)} The current price list is unchanged.</div>`;
  }
}

function bindUpload() {
  const zone = $('dropzone');
  const input = $('fileInput');
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => {
    if (input.files[0]) upload(input.files[0]);
    input.value = '';
  });
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  });
}

bindUpload();
load();
