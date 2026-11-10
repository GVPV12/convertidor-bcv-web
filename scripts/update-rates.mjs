// Lee la tasa oficial (USD y EUR) directamente de bcv.org.ve y la guarda en rates.json.
// Lo ejecuta la GitHub Action .github/workflows/update-rates.yml cada 30 minutos.
// Sin dependencias: solo Node 22.
//
// Está hecho para no romperse nunca:
//  1. Lee el HTML del BCV con varias estrategias, de la más precisa a la más tolerante.
//  2. Compara lo leído con DolarApi; si no cuadra, desconfía de la lectura.
//  3. Si el BCV no se puede leer, guarda la tasa oficial que publica DolarApi.
//  4. Si nada funciona, deja rates.json como estaba (la web sigue con DolarApi) y sale sin error.
// Los problemas se avisan con ::warning:: en la pestaña Actions, que no manda correos.
import https from 'node:https';
import { readFile, writeFile } from 'node:fs/promises';

const BCV_URL = 'https://www.bcv.org.ve/';
const DOLARAPI_URL = 'https://ve.dolarapi.com/v1/cotizaciones';
const OUT = new URL('../rates.json', import.meta.url);
const MAX_JUMP = 0.25;     // salto máximo aceptado respecto a la última tasa guardada
const MAX_MISMATCH = 0.08; // diferencia máxima aceptada entre la lectura del BCV y DolarApi
const MAX_BODY = 5 * 1024 * 1024;

const round = (n) => Math.round(n * 1e4) / 1e4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warn = (msg) => console.log(`::warning::${msg}`);

function get(url, { insecure = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: 20000,
      rejectUnauthorized: !insecure,
      headers: { 'User-Agent': 'Mozilla/5.0 (convertidor-bcv-web)' },
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      res.setEncoding('utf8');
      let body = '';
      res.on('data', (c) => {
        body += c;
        // La portada del BCV pesa unos cientos de KB; algo mucho más grande no es la página esperada.
        if (body.length > MAX_BODY) req.destroy(new Error('Respuesta demasiado grande'));
      });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado')));
    req.on('error', reject);
  });
}

// La web del BCV suele servir su certificado sin la cadena intermedia, y Node (a diferencia
// del navegador) no la completa solo. Primero se intenta con verificación; si falla solo por
// el certificado, se reintenta sin ella. Es una lectura de datos públicos (no se envía nada).
// Sin verificación, alguien en medio de la conexión podría servir una tasa falsa, así que una
// lectura insegura queda marcada y solo se acepta si DolarApi la confirma (ver main()).
async function getBcvOnce() {
  try {
    return { html: await get(BCV_URL), insecure: false };
  } catch (err) {
    if (!/certificate|self.signed|UNABLE_TO|CERT_/i.test(`${err.code} ${err.message}`)) throw err;
    return { html: await get(BCV_URL, { insecure: true }), insecure: true };
  }
}

async function fetchBcv() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await getBcvOnce();
    } catch (err) {
      if (attempt === 3) throw err;
      console.log(`BCV: intento ${attempt}/3 fallido (${err.code || err.message}); reintentando.`);
      await sleep(15000);
    }
  }
}

/* ---------------- Lectura tolerante del HTML del BCV ---------------- */

// "899,27050000" (formato del BCV), "1.006,60742688" o "899.2705".
function toNumber(s) {
  if (!s) return NaN;
  return s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
}

// HTML → texto plano: "… USD 899,27050000 … Fecha Valor: Martes, 10 Noviembre 2026 …".
function toText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ');
}

const NUM = '(\\d{1,3}(?:\\.\\d{3})*,\\d+|\\d+[.,]\\d+)';

// Cada estrategia devuelve un número o NaN; se usa la primera que dé algo.
function pickRate(html, text, id, code) {
  const strategies = [
    // <div id="dolar">…<strong class="strong-tb">899,27050000</strong>
    () => new RegExp(`id="${id}"[\\s\\S]*?<strong[^>]*>\\s*${NUM}\\s*</strong>`).exec(html)?.[1],
    // El mismo bloque aunque cambie la etiqueta del número.
    () => new RegExp(`id="${id}"[\\s\\S]{0,1500}?>\\s*${NUM}\\s*<`).exec(html)?.[1],
    // Texto plano: "USD 899,27050000".
    () => new RegExp(`\\b${code}\\b\\s*:?\\s*${NUM}`).exec(text)?.[1],
  ];
  for (const s of strategies) {
    const v = toNumber(s());
    if (v > 0) return round(v);
  }
  return NaN;
}

const MONTHS = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function pickDate(html, text) {
  // <span … content="2026-11-10T00:00:00-04:00">, cerca de "Fecha Valor".
  const iso = /Fecha\s+Valor[\s\S]{0,400}?content="(\d{4}-\d{2}-\d{2})/i.exec(html)?.[1];
  if (iso) return iso;
  // Texto: "Fecha Valor: Martes, 10 Noviembre 2026" (o "10 de noviembre de 2026").
  const m = /Fecha\s+Valor\s*:?\s*(?:[\p{L}]+,?\s+)?(\d{1,2})\s+(?:de\s+)?([\p{L}]+)\s+(?:de\s+)?(\d{4})/iu.exec(text);
  const month = m && MONTHS[m[2].toLowerCase()];
  if (month) return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

async function readBcv() {
  const { html, insecure } = await fetchBcv();
  const text = toText(html);
  const r = {
    fechaValor: pickDate(html, text),
    USD: pickRate(html, text, 'dolar', 'USD'),
    EUR: pickRate(html, text, 'euro', 'EUR'),
    fuente: 'bcv.org.ve',
  };
  if (!r.fechaValor || !(r.USD > 0) || !(r.EUR > 0)) {
    throw new Error(`no se entendió el HTML (¿cambió?): ${JSON.stringify(r)}`);
  }
  return { ...r, insecure };
}

/* ---------------- Respaldo: DolarApi ---------------- */

async function readDolarApi() {
  const list = JSON.parse(await get(DOLARAPI_URL));
  const pick = (code) => list.find((x) => x.moneda === code && /oficial/i.test(`${x.fuente} ${x.nombre}`));
  const usd = pick('USD'), eur = pick('EUR');
  const r = {
    // "2026-11-10T00:00:00-04:00" → "2026-11-10" (fecha en hora de Venezuela).
    fechaValor: /^\d{4}-\d{2}-\d{2}/.exec(usd?.fechaActualizacion ?? '')?.[0] ?? null,
    USD: round(Number(usd?.promedio)),
    EUR: round(Number(eur?.promedio)),
    fuente: 'dolarapi',
  };
  if (!r.fechaValor || !(r.USD > 0) || !(r.EUR > 0)) throw new Error(`respuesta inesperada: ${JSON.stringify(r)}`);
  return r;
}

/* ---------------- Elegir y guardar ---------------- */

const differs = (a, b) => Math.abs(a - b) / b;

async function main() {
  const [bcv, api] = await Promise.allSettled([readBcv(), readDolarApi()]);
  if (bcv.status === 'rejected') warn(`BCV: ${bcv.reason?.message ?? bcv.reason}`);
  if (api.status === 'rejected') console.log(`DolarApi: ${api.reason?.message ?? api.reason}`);

  let next = bcv.value ?? null;
  const ref = api.value ?? null;

  // Si lo leído del BCV no se parece a DolarApi, probablemente se leyó el número equivocado.
  if (next && ref && (differs(next.USD, ref.USD) > MAX_MISMATCH || differs(next.EUR, ref.EUR) > MAX_MISMATCH)) {
    warn(`La lectura del BCV (${next.USD} / ${next.EUR}) no cuadra con DolarApi (${ref.USD} / ${ref.EUR}); se descarta.`);
    next = null;
  }
  // Una lectura sin verificar el certificado no se puede comprobar sola: sin DolarApi para
  // contrastarla, no se guarda.
  if (next?.insecure && !ref) {
    warn('El BCV se leyó sin verificar el certificado y DolarApi no respondió para confirmarlo; no se guarda.');
    next = null;
  }
  if (next) delete next.insecure;
  // DolarApi solo se usa si el BCV falló o si trae una fecha valor posterior.
  if (ref && (!next || ref.fechaValor > next.fechaValor)) {
    if (!next) warn('Se usa la tasa oficial de DolarApi como respaldo.');
    next = ref;
  }
  if (!next) { warn('No hay ninguna fuente disponible; rates.json no cambia.'); return; }

  let prev = null;
  try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* primera ejecución */ }

  if (prev?.fechaValor && next.fechaValor < prev.fechaValor) {
    console.log(`La tasa leída (${next.fechaValor}) es anterior a la guardada (${prev.fechaValor}); no se cambia.`);
    return;
  }
  if (prev?.USD > 0 && differs(next.USD, prev.USD) > MAX_JUMP) {
    warn(`Salto sospechoso en USD: ${prev.USD} → ${next.USD}; no se guarda.`);
    return;
  }
  if (prev && prev.fechaValor === next.fechaValor && prev.USD === next.USD && prev.EUR === next.EUR) {
    console.log('Sin cambios:', next);
    return;
  }

  const out = { ...next, obtenido: new Date().toISOString() };
  await writeFile(OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log('Tasa actualizada:', out);
}

// Pase lo que pase, la Action termina bien: un fallo aquí nunca debe romper la web ni mandar correos.
try {
  await main();
} catch (err) {
  warn(`Error inesperado: ${err?.stack ?? err}`);
}
