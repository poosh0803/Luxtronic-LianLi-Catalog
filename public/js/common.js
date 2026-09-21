// Shared helpers used across pages.

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const moneyFormat = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
function formatMoney(amount) {
  return amount === null || amount === undefined ? '-' : moneyFormat.format(amount);
}

function formatDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-AU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Plain-http LAN pages have no navigator.clipboard, so fall back to execCommand.
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

function highlightNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-bar a.nav-item[href]').forEach((a) => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });
}

function initDarkMode() {
  const toggle = document.getElementById('darkModeToggle');
  const icon = document.getElementById('themeIcon');
  const applyTheme = (dark) => {
    document.body.classList.toggle('dark-mode', dark);
    if (icon) {
      icon.classList.toggle('fa-moon', !dark);
      icon.classList.toggle('fa-sun', dark);
    }
  };
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch { /* storage blocked */ }
  applyTheme(saved === 'dark');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const dark = !document.body.classList.contains('dark-mode');
      try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
      applyTheme(dark);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  highlightNav();
  initDarkMode();
});
