// Server-side data feeds for the Fuel and HW price pages.
//
// The portal fetches and parses the upstream sites itself (instead of every
// browser calling them directly through public CORS proxies), caches the
// result, and serves small JSON to the pages. If an upstream is down we keep
// serving the last good copy and flag it as stale.

const FUEL_URL = 'https://projectzerothree.info/api.php?format=json';
const PGRID_ORIGIN = 'https://www.pgrid.app';
const HW_PATHS = { gpu: '/au/gpus', ram: '/au/rams', ssd: '/au/ssds' };

const FUEL_TTL_MS = 15 * 60 * 1000;
const HW_TTL_MS = 60 * 60 * 1000;
const MIN_REFRESH_GAP_MS = 60 * 1000; // a manual refresh can't hammer the upstream
const FUEL_ORDER = ['U91', 'E10', 'U95', 'U98', 'Diesel', 'LPG'];
const PER_FUEL_LIMIT = 5;

const cache = new Map();
const inflight = new Map();

async function cached(key, ttlMs, loader, force) {
  const hit = cache.get(key);
  const age = hit ? Date.now() - hit.time : Infinity;
  if (hit && age < ttlMs && !(force && age > MIN_REFRESH_GAP_MS)) {
    return { data: hit.data, time: hit.time, stale: false };
  }
  if (inflight.has(key)) return inflight.get(key);

  const promise = loader()
    .then((data) => {
      const entry = { data, time: Date.now() };
      cache.set(key, entry);
      return { data, time: entry.time, stale: false };
    })
    .catch((err) => {
      if (hit) return { data: hit.data, time: hit.time, stale: true };
      throw err;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Luxtronic Portal)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
  return res.text();
}

// ---------- fuel ----------

async function loadFuel() {
  const raw = JSON.parse(await fetchText(FUEL_URL));
  const regions = {};

  for (const regionObj of raw.regions || []) {
    // "NSW", "NSW-2", "NSW-3" are pages of the same region.
    const region = String(regionObj.region).split('-')[0];
    if (region === 'All') continue;
    const byFuel = (regions[region] = regions[region] || {});
    for (const p of regionObj.prices || []) {
      const list = (byFuel[p.type] = byFuel[p.type] || []);
      if (list.some((x) => x.name === p.name && x.suburb === p.suburb)) continue;
      list.push({ name: p.name, suburb: p.suburb, state: p.state, postcode: p.postcode, price: p.price });
    }
  }

  for (const byFuel of Object.values(regions)) {
    for (const type of Object.keys(byFuel)) {
      byFuel[type].sort((a, b) => a.price - b.price);
      byFuel[type] = byFuel[type].slice(0, PER_FUEL_LIMIT);
    }
  }

  // Shop is in NSW, so list it first.
  const ordered = {};
  for (const name of ['NSW', 'VIC', 'QLD', 'WA', 'ACT', 'SA', 'TAS', 'NT']) if (regions[name]) ordered[name] = regions[name];
  for (const name of Object.keys(regions)) if (!ordered[name]) ordered[name] = regions[name];

  return {
    updated: raw.updated ? new Date(raw.updated * 1000).toISOString() : null,
    fuelOrder: FUEL_ORDER,
    regions: ordered,
  };
}

// ---------- hardware (PGrid) ----------

const ENTITIES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };

function cleanText(html) {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|quot|#39|lt|gt|nbsp);/g, (m) => ENTITIES[m])
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePgridTable(html) {
  const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
  const table = tables.find((t) => /<tbody/.test(t));
  if (!table) throw new Error('No price table found');

  const thead = table.match(/<thead[\s\S]*?<\/thead>/);
  const headers = [...(thead ? thead[0] : '').matchAll(/<th[\s\S]*?<\/th>/g)].map((m) => cleanText(m[0]));
  const priceIdx = headers.findIndex((h) => h.toLowerCase() === 'price');
  if (priceIdx === -1) throw new Error('No price column found');

  const rows = [];
  let group = null;
  const tbody = table.match(/<tbody[\s\S]*?<\/tbody>/)[0];
  for (const tr of tbody.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...tr[0].matchAll(/<t[dh][\s\S]*?<\/t[dh]>/g)].map((m) => cleanText(m[0]));
    if (cells.length < headers.length) {
      // single-cell rows are series headings ("RX 9000 Series AMD · 6 models")
      if (cells.length) group = cells[0];
      continue;
    }
    const link = tr[0].match(/href="([^"]+)"/);
    rows.push({ cells, href: link ? PGRID_ORIGIN + link[1] : null, group });
  }
  if (!rows.length) throw new Error('Price table was empty');
  return { headers, priceIdx, rows };
}

async function loadHw(category) {
  return parsePgridTable(await fetchText(PGRID_ORIGIN + HW_PATHS[category]));
}

// ---------- public API ----------

function getFuel(force) {
  return cached('fuel', FUEL_TTL_MS, loadFuel, force);
}

function getHw(category, force) {
  if (!Object.prototype.hasOwnProperty.call(HW_PATHS, category)) return null;
  return cached(`hw:${category}`, HW_TTL_MS, () => loadHw(category), force);
}

module.exports = { getFuel, getHw };
