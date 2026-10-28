'use strict';

// DolarApi (Venezuela) publica las tasas oficiales del BCV con CORS abierto y sin API key.
// Docs: https://dolarapi.com/docs/venezuela/
const API_BASE = 'https://ve.dolarapi.com/v1';

const CURRENCIES = {
  USD: {
    code: 'USD', symbol: '$',
    current: `${API_BASE}/dolares/oficial`,
    history: `${API_BASE}/historicos/dolares/oficial`,
    cacheKey: 'bcv-rate-cache-v1',
  },
  EUR: {
    code: 'EUR', symbol: '€',
    current: `${API_BASE}/euros/oficial`,
    history: `${API_BASE}/historicos/euros/oficial`,
    cacheKey: 'bcv-rate-cache-eur-v1',
  },
};
const CODES = Object.keys(CURRENCIES);
// rates.json lo genera una GitHub Action leyendo bcv.org.ve cada 30 min (scripts/update-rates.mjs).
// Trae la tasa con su "fecha valor", así que suele adelantarse a DolarApi por la tarde.
const BCV_FILE_URL = 'rates.json';
const SKINS = ['fluid', 'hologram', 'emerald'];
const SKIN_THEME_COLORS = { fluid: '#04101f', hologram: '#0e0d12', emerald: '#0a0c0c' };
const SETTINGS_KEY = 'bcv-settings';
const CURRENCY_PREF_KEY = 'bcv-currency';
const REFRESH_MS = 15 * 60 * 1000;
const AUTO_SKIN_MS = 30 * 1000;
const SPLASH_MAX_MS = 4500;

const $ = (sel) => document.querySelector(sel);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Preferencias ---------------- */

const savedSettings = readStorage(SETTINGS_KEY) || {};
const settings = {
  lang: savedSettings.lang === 'en' ? 'en' : 'es',
  skin: SKINS.includes(savedSettings.skin) ? savedSettings.skin : 'fluid',
  autoSkin: savedSettings.autoSkin === true,
  randomSkin: savedSettings.randomSkin === true, // la elección aleatoria se hace en <head>
  simple: savedSettings.simple === true,         // solo el precio, sin gráfica ni variación
  verify: savedSettings.verify === true,         // botón a la página oficial del BCV
};
const saveSettings = () => writeStorage(SETTINGS_KEY, settings);

function t(key, vars = {}) {
  const str = I18N[settings.lang][key] ?? I18N.es[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// Formatos de número y fecha según el idioma activo.
let fmt2, fmtDay, fmtLong, rtf;
function buildFormatters() {
  const locale = settings.lang === 'en' ? 'en-US' : 'es-VE';
  fmt2 = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  fmtDay = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  fmtLong = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' });
  rtf = new Intl.RelativeTimeFormat(settings.lang, { numeric: 'auto' });
}
buildFormatters();

/* ---------------- Estado ---------------- */

// Datos por moneda: cada una guarda su tasa, su histórico y su origen.
const store = Object.fromEntries(Object.keys(CURRENCIES).map((code) => (
  [code, { rate: 0, updatedAt: null, source: 'loading', history: [] }]
)));

const savedCurrency = readStorage(CURRENCY_PREF_KEY);

const state = {
  currency: CODES.includes(savedCurrency) ? savedCurrency : 'USD',
  range: 30,
  mode: 'fx-ves', // fx-ves (divisa → Bs) | ves-fx (Bs → divisa)
  displayedRate: 0,
  lastResult: null,
  chart: null,
};

const cur = () => store[state.currency];
const cfg = () => CURRENCIES[state.currency];

const el = {
  splash: $('#splash'), splashBar: $('#splash-bar'), splashPct: $('#splash-pct'), splashLabel: $('#splash-label'),
  status: $('#status'), statusDot: $('#status-dot'), statusText: $('#status-text'),
  currencyBtn: $('#currency-btn'), currencyBtnLabel: $('#currency-btn-label'), headerSub: $('#header-sub'),
  updated: $('#updated'), rateValue: $('#rate-value'), rateChange: $('#rate-change'), ratePer: $('#rate-per'),
  refreshBtn: $('#refresh-btn'), range: $('#range'),
  chartBox: $('#chart-box'), chart: $('#chart'), chartLine: $('#chart-line'), chartGlow: $('#chart-glow'),
  chartArea: $('#chart-area'), chartDot: $('#chart-dot'), chartHover: $('#chart-hover'),
  chartGuide: $('#chart-guide'), chartTooltip: $('#chart-tooltip'), chartEmpty: $('#chart-empty'),
  mode: $('#mode'), modeFx: $('#mode-fx'), modeVes: $('#mode-ves'), swapBtn: $('#swap-btn'),
  form: $('#conv-form'), field: $('#field'),
  amount: $('#amount'), amountLabel: $('#amount-label'), prefix: $('#prefix'), chips: $('#chips'),
  error: $('#error'), result: $('#result'), resultLabel: $('#result-label'), resultMeta: $('#result-meta'),
  copyBtn: $('#copy-btn'),
  quote: document.querySelector('.quote'), quoteText: $('#quote-text'), quoteAuthor: $('#quote-author'), quoteBtn: $('#quote-btn'),
  settingsBtn: $('#settings-btn'), settingsPanel: $('#settings-panel'), settingsClose: $('#settings-close'),
  langToggle: $('#lang-toggle'), skinGrid: $('#skin-grid'), autoSkin: $('#auto-skin'),
  randomSkin: $('#random-skin'), simpleView: $('#simple-view'),
  verifyToggle: $('#verify-toggle'),
  themeColor: document.querySelector('meta[name="theme-color"]'),
  toast: $('#toast'),
};

/* ---------------- Utilidades ---------------- */

async function fetchJSON(url, timeout = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v.replace(',', '.'));
  return NaN;
}

// El BCV publica una sola tasa; DolarApi la expone como "promedio".
function toRate(obj) {
  const v = toNumber(obj?.promedio ?? obj?.venta ?? obj?.compra);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

// Las fechas "AAAA-MM-DD" se interpretan en hora local (no UTC) para no correr el día.
function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(s);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Lee montos según el idioma:
//  es → "1.234,56", "1.500" (miles), "1234,5"
//  en → "1,234.56", "1,500" (miles), "1234.5"
function parseAmount(raw, lang = settings.lang) {
  let s = raw.trim().replace(/\s+/g, '').replace(/^(\$|€|usd|eur|bs\.?|ves)/i, '');
  if (!s) return null;
  if (lang === 'en') {
    s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^-?\d*\.?\d*$/.test(s) || s === '.' || s === '-') return NaN;
  return Number(s);
}

function relativeTime(date) {
  const secs = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(secs);
  if (abs < 60) return t('updated.justNow');
  if (abs < 3600) return rtf.format(Math.round(secs / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), 'hour');
  return rtf.format(Math.round(secs / 86400), 'day');
}

function readStorage(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* almacenamiento no disponible */ }
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('is-visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.toast.classList.remove('is-visible'), 1800);
}

function animateNumber(node, from, to) {
  cancelAnimationFrame(animateNumber.raf);
  if (!to) { node.textContent = '—'; return; }
  if (reduceMotion || from === to) { node.textContent = fmt2.format(to); return; }
  const start = performance.now();
  const dur = 900;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    node.textContent = fmt2.format(from + (to - from) * e);
    if (p < 1) animateNumber.raf = requestAnimationFrame(step);
  };
  animateNumber.raf = requestAnimationFrame(step);
}

/* ---------------- Datos ---------------- */

// Una sola petición a rates.json sirve para ambas monedas durante un minuto.
let bcvFile = { at: 0, promise: null };
function fetchBcvFile() {
  if (!bcvFile.promise || Date.now() - bcvFile.at > 60 * 1000) {
    bcvFile = { at: Date.now(), promise: fetchJSON(BCV_FILE_URL) };
    bcvFile.promise.catch(() => { bcvFile.at = 0; });
  }
  return bcvFile.promise;
}

async function rateFromBcvFile(code) {
  const res = await fetchBcvFile();
  const rate = toNumber(res?.[code]);
  const date = parseDate(res?.fechaValor);
  if (!(rate > 0) || !date) throw new Error('rates.json no trae esta moneda');
  return { rate, date };
}

async function rateFromDolarApi(code) {
  const res = await fetchJSON(CURRENCIES[code].current);
  const rate = toRate(res);
  if (!rate) throw new Error('La respuesta no trae una tasa válida');
  return { rate, date: parseDate(res.fechaActualizacion) || new Date() };
}

const dayKey = (d) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();

async function loadHistory(code) {
  const data = store[code];
  try {
    const list = await fetchJSON(CURRENCIES[code].history, 10000);
    data.history = (Array.isArray(list) ? list : [])
      .map((d) => ({ date: parseDate(d.fecha), value: toRate(d) }))
      .filter((p) => p.date && p.value > 0)
      .sort((a, b) => a.date - b.date);
  } catch (err) {
    console.warn(`[BCV] histórico ${code} no disponible:`, err);
    data.history = [];
  }
  if (code === state.currency) renderChart();
  return data.history;
}

async function loadRate(code, historyPromise) {
  // Se consultan las dos fuentes a la vez. Gana rates.json (leído del BCV) salvo que
  // DolarApi traiga una tasa de un día posterior (por ejemplo, si la Action dejó de correr).
  const [file, api] = await Promise.allSettled([rateFromBcvFile(code), rateFromDolarApi(code)]);
  if (file.status === 'rejected') console.warn(`[BCV] tasa ${code} no disponible en rates.json:`, file.reason);
  if (api.status === 'rejected') console.warn(`[BCV] tasa ${code} no disponible en DolarApi:`, api.reason);
  const f = file.value, a = api.value;
  const best = f && a ? (dayKey(a.date) > dayKey(f.date) ? a : f) : f || a;
  if (best) { setRate(code, best.rate, best.date, 'live'); return; }

  // Respaldo: último valor del histórico.
  const history = await historyPromise;
  const last = history[history.length - 1];
  if (last) { setRate(code, last.value, last.date, 'live'); return; }

  // Respaldo 2: última tasa guardada en este navegador.
  const cached = readStorage(CURRENCIES[code].cacheKey);
  if (cached?.rate > 0) { setRate(code, cached.rate, new Date(cached.updatedAt), 'cache'); return; }

  setRate(code, 0, null, 'none');
}

function setRate(code, rate, date, source) {
  Object.assign(store[code], { rate, updatedAt: date, source });
  if (source === 'live') writeStorage(CURRENCIES[code].cacheKey, { rate, updatedAt: date.toISOString() });
  if (code === state.currency) renderRateView();
}

async function refresh(code = state.currency) {
  const active = code === state.currency;
  if (active) { el.refreshBtn.classList.add('is-spinning'); el.refreshBtn.disabled = true; }
  const historyPromise = loadHistory(code);
  await loadRate(code, historyPromise);
  await historyPromise;
  if (active) { el.refreshBtn.classList.remove('is-spinning'); el.refreshBtn.disabled = false; }
}

/* ---------------- Render: tasa y estado ---------------- */

function renderRateView({ redrawChart = true } = {}) {
  const { rate } = cur();
  animateNumber(el.rateValue, state.displayedRate, rate);
  state.displayedRate = rate;
  renderUpdated();
  renderStatus();
  if (redrawChart) renderChart();
  updateConversion();
}

function renderUpdated() {
  const { updatedAt, source } = cur();
  if (source === 'loading' || source === 'none' || !updatedAt) {
    el.updated.textContent = t(source === 'none' ? 'updated.none' : 'updated.loading');
    el.updated.removeAttribute('title');
    return;
  }
  el.updated.title = fmtLong.format(updatedAt);
  // El BCV publica por la tarde la tasa con "fecha valor" del siguiente día hábil.
  if (updatedAt.getTime() - Date.now() > 60 * 1000) {
    el.updated.textContent = t('updated.future', { date: fmtDay.format(updatedAt) });
    return;
  }
  el.updated.textContent = `${t(source === 'cache' ? 'updated.cache' : 'updated.live')} ${relativeTime(updatedAt)}`;
}

function renderStatus() {
  const label = t(`status.${cur().source}`);
  el.statusDot.dataset.state = cur().source;
  el.statusText.textContent = label;
  el.status.title = label;
}

/* ---------------- Render: gráfico ---------------- */

function getSeries() {
  const { history, rate, updatedAt, source } = cur();
  const pts = history.slice();
  // Si la tasa en vivo es de un día posterior al último del histórico, se agrega.
  if (rate && updatedAt && source === 'live') {
    const last = pts[pts.length - 1];
    if (!last || updatedAt.toDateString() !== last.date.toDateString() && updatedAt > last.date) {
      pts.push({ date: updatedAt, value: rate });
    }
  }
  if (!pts.length) return pts;
  const cutoff = new Date(pts[pts.length - 1].date);
  cutoff.setDate(cutoff.getDate() - state.range);
  return pts.filter((p) => p.date >= cutoff);
}

// Curva monótona (Fritsch–Carlson): suave y sin sobrepasar los datos reales.
function smoothPath(xs, ys) {
  const n = xs.length;
  const r = (v) => Math.round(v * 100) / 100;
  const dx = [], m = [], tg = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i];
    m[i] = (ys[i + 1] - ys[i]) / dx[i];
  }
  tg[0] = m[0];
  tg[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) tg[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { tg[i] = 0; tg[i + 1] = 0; continue; }
    const a = tg[i] / m[i], b = tg[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); tg[i] = k * a * m[i]; tg[i + 1] = k * b * m[i]; }
  }
  let d = `M${r(xs[0])} ${r(ys[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${r(xs[i] + h)} ${r(ys[i] + tg[i] * h)} ${r(xs[i + 1] - h)} ${r(ys[i + 1] - tg[i + 1] * h)} ${r(xs[i + 1])} ${r(ys[i + 1])}`;
  }
  return d;
}

function renderChart({ animate = true } = {}) {
  const pts = getSeries();
  hideHover();

  if (pts.length < 2) {
    state.chart = null;
    for (const p of [el.chartLine, el.chartGlow, el.chartArea]) p.setAttribute('d', '');
    el.chartDot.hidden = true;
    el.chartEmpty.hidden = cur().source === 'loading';
    el.rateChange.textContent = '';
    return;
  }

  el.chartEmpty.hidden = true;
  const W = 600, H = 220, padT = 40, padB = 30;
  const vals = pts.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 1e-9) { min -= 1; max += 1; }
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * W);
  const ys = vals.map((v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB));
  const d = smoothPath(xs, ys);

  el.chartLine.setAttribute('d', d);
  el.chartGlow.setAttribute('d', d);
  el.chartArea.setAttribute('d', `${d}L${W} ${H}L0 ${H}Z`);
  state.chart = { pts, xs, ys, W, H };

  if (animate) {
    // Redibujar con animación de trazo.
    el.chart.classList.remove('is-drawn');
    void el.chart.getBoundingClientRect();
  }
  el.chart.classList.add('is-drawn');

  const lastIdx = pts.length - 1;
  placeAt(el.chartDot, xs[lastIdx] / W, ys[lastIdx] / H);
  el.chartDot.hidden = false;
  el.chartDot.style.animationDelay = reduceMotion || !animate ? '0s' : '1.1s';

  renderChange(vals[0], vals[lastIdx]);
}

function renderChange(first, last) {
  const pct = ((last - first) / first) * 100;
  const dir = pct >= 0 ? 'up' : 'down';
  el.rateChange.dataset.dir = dir;
  el.rateChange.textContent = `· ${dir === 'up' ? '↗' : '↘'} ${pct >= 0 ? '+' : '−'}${fmt2.format(Math.abs(pct))}% ${t('rate.change', { days: state.range })}`;
}

function placeAt(node, fx, fy) {
  node.style.left = `${fx * 100}%`;
  if (fy !== undefined) node.style.top = `${fy * 100}%`;
}

function hideHover() {
  el.chartHover.hidden = el.chartGuide.hidden = el.chartTooltip.hidden = true;
}

function onChartPointer(e) {
  const c = state.chart;
  if (!c) return;
  const rect = el.chartBox.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const i = Math.round(ratio * (c.pts.length - 1));
  const fx = c.xs[i] / c.W;
  placeAt(el.chartHover, fx, c.ys[i] / c.H);
  placeAt(el.chartGuide, fx);
  el.chartTooltip.innerHTML = `<strong>${fmt2.format(c.pts[i].value)} Bs</strong><span>${fmtDay.format(c.pts[i].date)}</span>`;
  // Mantener el tooltip dentro de la tarjeta.
  el.chartTooltip.hidden = false;
  const half = el.chartTooltip.offsetWidth / 2 / rect.width;
  placeAt(el.chartTooltip, Math.min(1 - half - 0.02, Math.max(half + 0.02, fx)));
  el.chartHover.hidden = el.chartGuide.hidden = false;
}

/* ---------------- Moneda (USD / EUR) ---------------- */

function renderCurrencyLabels() {
  const { code } = cfg();
  const plural = t(`currency.plural.${code}`);
  const other = state.currency === 'USD' ? 'EUR' : 'USD';
  el.currencyBtnLabel.textContent = other === 'EUR' ? 'EURO' : 'USD';
  el.currencyBtn.setAttribute('aria-label', t(`currency.aria.${other}`));
  el.currencyBtn.dataset.target = other;
  el.headerSub.textContent = t('header.sub', { code });
  el.ratePer.textContent = t('rate.per', { code });
  el.modeFx.textContent = `${code} → Bs`;
  el.modeVes.textContent = `Bs → ${code}`;

  const toVes = state.mode === 'fx-ves';
  el.prefix.textContent = toVes ? code : 'Bs';
  el.amountLabel.textContent = toVes ? t('conv.amountIn', { plural }) : t('conv.amountVes');
  el.resultLabel.textContent = toVes ? t('conv.resultVes') : t('conv.resultIn', { plural });
  el.amount.placeholder = fmt2.format(0);
  renderChips();
}

function setCurrency(code, { silent = false } = {}) {
  if (code === state.currency || !CODES.includes(code)) return;
  state.currency = code;
  writeStorage(CURRENCY_PREF_KEY, code);
  renderCurrencyLabels();
  renderRateView();
  if (cur().source === 'none') refresh(code);
  if (!silent) toast(t('currency.toast', { name: t(`currency.name.${code}`) }));
}

/* ---------------- Conversor ---------------- */

const CHIP_VALUES = { 'fx-ves': [1, 10, 15, 30, 50, 100], 'ves-fx': [100, 1000, 5000, 10000] };

function formatResult(value) {
  return state.mode === 'fx-ves' ? `Bs ${fmt2.format(value)}` : `${cfg().symbol} ${fmt2.format(value)}`;
}

function setMode(mode, { carry = false } = {}) {
  if (mode === state.mode) return;
  const carried = carry && state.lastResult != null ? fmt2.format(state.lastResult) : null;
  state.mode = mode;

  el.mode.dataset.mode = mode;
  for (const b of el.mode.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  el.swapBtn.classList.toggle('is-flipped', mode === 'ves-fx');
  renderCurrencyLabels();

  if (carried) el.amount.value = carried;
  updateConversion({ pop: true });
}

function renderChips() {
  const { symbol } = cfg();
  const toVes = state.mode === 'fx-ves';
  const int = new Intl.NumberFormat(settings.lang === 'en' ? 'en-US' : 'es-VE');
  el.chips.replaceChildren(...CHIP_VALUES[state.mode].map((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = toVes ? `${symbol}${v}` : `Bs ${int.format(v)}`;
    b.addEventListener('click', () => {
      el.amount.value = fmt2.format(v);
      updateConversion({ pop: true });
    });
    return b;
  }));
}

function setError(msg) {
  el.error.textContent = msg;
  el.field.classList.remove('is-error');
  if (msg) { void el.field.offsetWidth; el.field.classList.add('is-error'); }
}

function showResult(value, { pop = false } = {}) {
  state.lastResult = value;
  el.result.textContent = formatResult(value ?? 0);
  if (pop && !reduceMotion) {
    el.result.classList.remove('is-pop');
    void el.result.offsetWidth;
    el.result.classList.add('is-pop');
  }
}

function updateConversion({ submit = false, pop = false } = {}) {
  const { rate, source } = cur();
  el.resultMeta.textContent = rate
    ? t('conv.meta', { code: cfg().code, rate: fmt2.format(rate) })
    : t(source === 'loading' ? 'conv.metaLoading' : 'conv.metaNone');

  const amount = parseAmount(el.amount.value);
  if (amount === null) {
    setError(submit ? t('err.empty') : '');
    showResult(null);
    return;
  }
  if (Number.isNaN(amount)) { setError(t('err.invalid')); showResult(null); return; }
  if (amount < 0) { setError(t('err.negative')); showResult(null); return; }
  if (!rate) {
    setError(source === 'loading' ? '' : t('err.noRate'));
    showResult(null);
    return;
  }

  setError('');
  const out = state.mode === 'fx-ves' ? amount * rate : amount / rate;
  showResult(out, { pop: pop || submit });
}

async function copyResult() {
  if (state.lastResult == null) { toast(t('toast.convertFirst')); return; }
  try {
    await navigator.clipboard.writeText(el.result.textContent);
    el.copyBtn.classList.add('is-copied');
    setTimeout(() => el.copyBtn.classList.remove('is-copied'), 1500);
    toast(t('toast.copied'));
  } catch {
    toast(t('toast.copyFailed'));
  }
}

/* ---------------- Frase del día ---------------- */

// Una frase aleatoria en cada visita, distinta a la de la visita anterior.
const LAST_QUOTE_KEY = 'bcv-last-quote';
let quoteIndex = (() => {
  const last = readStorage(LAST_QUOTE_KEY);
  let i;
  do { i = Math.floor(Math.random() * QUOTES.length); } while (i === last && QUOTES.length > 1);
  writeStorage(LAST_QUOTE_KEY, i);
  return i;
})();

function renderQuote() {
  const q = QUOTES[quoteIndex];
  const author = settings.lang === 'en' ? (QUOTE_AUTHORS_EN[q.author] ?? q.author) : q.author;
  el.quoteText.textContent = q[settings.lang];
  el.quoteAuthor.textContent = `— ${author}`;
}

function nextQuote() {
  let i;
  do { i = Math.floor(Math.random() * QUOTES.length); } while (i === quoteIndex && QUOTES.length > 1);
  quoteIndex = i;
  if (reduceMotion) { renderQuote(); return; }
  el.quote.classList.add('is-swapping');
  setTimeout(() => {
    renderQuote();
    el.quote.classList.remove('is-swapping');
  }, 300);
}

/* ---------------- Idioma ---------------- */

function applyStaticTexts() {
  document.documentElement.lang = settings.lang;
  document.title = t('doc.title');
  document.querySelector('meta[name="description"]').content = t('doc.description');
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-aria]')) node.setAttribute('aria-label', t(node.dataset.i18nAria));
  for (const node of document.querySelectorAll('[data-i18n-title]')) node.title = t(node.dataset.i18nTitle);
}

function setLanguage(lang) {
  if (lang === settings.lang) return;
  // Conservar el monto escrito, reescrito con el formato del nuevo idioma.
  const typed = parseAmount(el.amount.value, settings.lang);

  settings.lang = lang;
  saveSettings();
  buildFormatters();
  applyStaticTexts();
  if (Number.isFinite(typed)) el.amount.value = fmt2.format(typed);

  renderCurrencyLabels();
  renderQuote();
  renderSettingsState();
  el.rateValue.textContent = cur().rate ? fmt2.format(cur().rate) : '—';
  state.displayedRate = cur().rate;
  renderUpdated();
  renderStatus();
  renderChart({ animate: false });
  updateConversion();
}

/* ---------------- Skins ---------------- */

function paintSkin() {
  document.documentElement.dataset.skin = settings.skin;
  el.themeColor.content = SKIN_THEME_COLORS[settings.skin];
  renderSettingsState();
}

function applySkin(skin) {
  if (!SKINS.includes(skin) || skin === settings.skin) return;
  settings.skin = skin;
  saveSettings();
  // Transición suave entre skins donde el navegador lo permite.
  if (document.startViewTransition && !reduceMotion) document.startViewTransition(paintSkin);
  else paintSkin();
}

let autoSkinTimer = null;
function setAutoSkin(on) {
  settings.autoSkin = on;
  saveSettings();
  clearInterval(autoSkinTimer);
  if (on) {
    autoSkinTimer = setInterval(() => {
      if (document.hidden) return;
      const next = SKINS[(SKINS.indexOf(settings.skin) + 1) % SKINS.length];
      applySkin(next);
    }, AUTO_SKIN_MS);
  }
  renderSettingsState();
}

function setRandomSkin(on) {
  settings.randomSkin = on;
  saveSettings();
  renderSettingsState();
}

/* ---------------- Vista simple (solo el precio) ---------------- */

function applySimple() {
  if (settings.simple) document.documentElement.dataset.simple = 'true';
  else delete document.documentElement.dataset.simple;
}

function setSimple(on) {
  settings.simple = on;
  saveSettings();
  applySimple();
  renderSettingsState();
  if (!on) renderChart(); // al volver a mostrarla, la gráfica se redibuja con su animación
}

/* ---------------- Verificar ---------------- */

function applyFlags() {
  const root = document.documentElement.dataset;
  if (settings.verify) root.verify = 'true'; else delete root.verify;
}

function setVerify(on) {
  settings.verify = on;
  saveSettings();
  applyFlags();
  renderSettingsState();
}

/* ---------------- Panel de opciones ---------------- */

function renderSettingsState() {
  for (const b of el.langToggle.querySelectorAll('[data-lang]')) b.setAttribute('aria-checked', String(b.dataset.lang === settings.lang));
  el.langToggle.dataset.active = settings.lang;
  for (const b of el.skinGrid.querySelectorAll('[data-skin]')) b.setAttribute('aria-checked', String(b.dataset.skin === settings.skin));
  el.autoSkin.checked = settings.autoSkin;
  el.randomSkin.checked = settings.randomSkin;
  el.simpleView.checked = settings.simple;
  el.verifyToggle.checked = settings.verify;
}

function positionSettings() {
  const r = el.settingsBtn.getBoundingClientRect();
  el.settingsPanel.style.top = `${r.bottom + 10}px`;
  el.settingsPanel.style.right = `${Math.max(16, window.innerWidth - r.right)}px`;
  // Si no cabe en la pantalla, el panel se desplaza por dentro.
  el.settingsPanel.style.maxHeight = `${Math.max(200, window.innerHeight - r.bottom - 26)}px`;
}

function openSettings() {
  positionSettings();
  el.settingsPanel.hidden = false;
  requestAnimationFrame(() => el.settingsPanel.classList.add('is-open'));
  el.settingsBtn.setAttribute('aria-expanded', 'true');
  el.settingsPanel.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
}

function closeSettings({ restoreFocus = false } = {}) {
  if (el.settingsPanel.hidden) return;
  el.settingsPanel.classList.remove('is-open');
  el.settingsBtn.setAttribute('aria-expanded', 'false');
  setTimeout(() => { if (!el.settingsPanel.classList.contains('is-open')) el.settingsPanel.hidden = true; }, 200);
  if (restoreFocus) el.settingsBtn.focus();
}

/* ---------------- Pantalla de carga ---------------- */

const splash = {
  pct: 0,
  timer: null,
  paint() {
    const p = Math.round(this.pct);
    el.splashBar.style.width = `${p}%`;
    el.splashPct.textContent = `${p}%`;
  },
  start() {
    this.timer = setInterval(() => { this.pct += (92 - this.pct) * 0.07; this.paint(); }, 60);
  },
  finish() {
    clearInterval(this.timer);
    this.pct = 100;
    this.paint();
    el.splashLabel.textContent = t(cur().rate ? 'splash.ready' : 'splash.retrying');
    setTimeout(() => el.splash.classList.add('is-done'), reduceMotion ? 0 : 380);
  },
};

/* ---------------- Inicio ---------------- */

function bindEvents() {
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    updateConversion({ submit: true });
  });
  el.amount.addEventListener('input', () => updateConversion());

  el.currencyBtn.addEventListener('click', () => setCurrency(el.currencyBtn.dataset.target));

  el.mode.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (b) setMode(b.dataset.mode);
  });
  el.swapBtn.addEventListener('click', () => setMode(state.mode === 'fx-ves' ? 'ves-fx' : 'fx-ves', { carry: true }));
  el.copyBtn.addEventListener('click', copyResult);

  el.range.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-range]');
    if (!b) return;
    state.range = Number(b.dataset.range);
    for (const x of el.range.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    renderChart();
  });
  el.refreshBtn.addEventListener('click', () => refresh());

  el.chartBox.addEventListener('pointermove', onChartPointer);
  el.chartBox.addEventListener('pointerdown', onChartPointer);
  el.chartBox.addEventListener('pointerleave', hideHover);

  el.quoteBtn.addEventListener('click', nextQuote);

  // Opciones
  el.settingsBtn.addEventListener('click', () => (el.settingsPanel.hidden ? openSettings() : closeSettings()));
  el.settingsClose.addEventListener('click', () => closeSettings({ restoreFocus: true }));
  el.langToggle.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (b) setLanguage(b.dataset.lang);
  });
  el.skinGrid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-skin]');
    if (b) applySkin(b.dataset.skin);
  });
  el.autoSkin.addEventListener('change', () => setAutoSkin(el.autoSkin.checked));
  el.randomSkin.addEventListener('change', () => setRandomSkin(el.randomSkin.checked));
  el.simpleView.addEventListener('change', () => setSimple(el.simpleView.checked));
  el.verifyToggle.addEventListener('change', () => setVerify(el.verifyToggle.checked));

  document.addEventListener('pointerdown', (e) => {
    if (!el.settingsPanel.hidden && !el.settingsPanel.contains(e.target) && !el.settingsBtn.contains(e.target)) closeSettings();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSettings({ restoreFocus: true });
  });
  window.addEventListener('resize', () => { if (!el.settingsPanel.hidden) positionSettings(); });
  window.addEventListener('scroll', () => { if (!el.settingsPanel.hidden) positionSettings(); }, { passive: true });

  // Mantener las tasas al día.
  setInterval(() => { if (!document.hidden) CODES.forEach((c) => refresh(c)); }, REFRESH_MS);
  setInterval(renderUpdated, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    const { updatedAt } = cur();
    if (!document.hidden && updatedAt && Date.now() - updatedAt.getTime() > REFRESH_MS) refresh();
  });
}

async function init() {
  paintSkin();
  applySimple();
  applyFlags();
  applyStaticTexts();
  renderQuote();
  renderCurrencyLabels();
  renderStatus();
  renderUpdated();
  renderSettingsState();
  bindEvents();
  if (settings.autoSkin) setAutoSkin(true);
  splash.start();

  const active = state.currency;
  const minShow = new Promise((r) => setTimeout(r, reduceMotion ? 0 : 900));
  const historyPromise = loadHistory(active);
  const ratePromise = loadRate(active, historyPromise);
  await Promise.race([
    Promise.all([ratePromise, minShow]),
    new Promise((r) => setTimeout(r, SPLASH_MAX_MS)),
  ]);
  splash.finish();

  // Precargar las demás monedas para que el cambio sea instantáneo.
  CODES.filter((c) => c !== active).forEach((c) => refresh(c));
}

init();
