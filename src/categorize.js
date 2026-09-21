// The Excel has no category column, so categories are worked out from the
// model code (Lian Li's part numbers are very regular) with the description
// as a fallback. Rules run top to bottom; first match wins.
// Order here is also the order the category filter buttons are shown in.

export const CATEGORIES = [
  'Cases',
  'Fans',
  'Liquid Coolers',
  'Power Supplies',
  'Risers & GPU Brackets',
  'Cables & Hubs',
  'Displays',
  'Desks',
  'Accessories',
];

const RULES = [
  { category: 'Desks', test: (m) => /^DK-/i.test(m) },
  { category: 'Cases', test: (m) => /^PC-/i.test(m) },
  // Galahad / Hydroshift AIO liquid coolers (GA2..., GHS...)
  { category: 'Liquid Coolers', test: (m) => /^(GA2|GHS)/i.test(m) },
  // Power supplies: EG1000.WE, EG0850G.B, RS1200G.BH, SP0750G.B, SX0850P.B, RB0550B.B
  // (EG-HUB01B is a fan hub - matched further down as Cables & Hubs)
  { category: 'Power Supplies', test: (m) => /^(EG|RS|SP|SX|RB)\d/i.test(m) },
  // UNI FAN family: 12SLIN1B, 14TL1W, 12RSL1F3B ... (12 / 14 = fan size in cm)
  { category: 'Fans', test: (m) => /^1[24][A-Z]/i.test(m) },
  // PCIe riser cables and vertical / upright GPU bracket kits
  {
    category: 'Risers & GPU Brackets',
    test: (m, d) =>
      /^PW-PCI/i.test(m) || /riser|vertical (gpu|bracket)|upright gpu|multi-directional vertical/i.test(d),
  },
  // Strimer RGB power cables, USB hubs (PW...) and fan hubs (EG-HUB...)
  { category: 'Cables & Hubs', test: (m) => /^PW/i.test(m) || /^EG-HUB/i.test(m) },
  // LCD / universal screens (SM088X, SM092VMX)
  { category: 'Displays', test: (m) => /^SM\d/i.test(m) },
];

export function categorize(model, description) {
  for (const rule of RULES) {
    if (rule.test(model, description)) return rule.category;
  }
  return 'Accessories';
}

// Colour is read from the description ("... Black", "... WHITE"); the sheet
// has no colour column. Returns '' when the description doesn't say.
export function detectColor(description, model = '') {
  const found = new Set();
  const re = /\b(black|white|silver|grey|gray)\b/gi;
  let m;
  while ((m = re.exec(description))) {
    const c = m[1].toLowerCase();
    found.add(c === 'gray' ? 'Grey' : c[0].toUpperCase() + c.slice(1));
  }
  if (found.size === 1) return [...found][0];
  if (found.size > 1) return ''; // ambiguous, e.g. "Black/White" combos
  // no colour word: fall back on the Lian Li suffix convention (...B / ...W / ...X)
  // only when it's unambiguous enough to trust
  if (/[.\d](B|BH|BE)$/i.test(model) || /X$/.test(model)) return 'Black';
  if (/[.\d](W|WH|WE)$/i.test(model)) return 'White';
  return '';
}
