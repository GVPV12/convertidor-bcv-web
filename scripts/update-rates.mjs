// Lee la tasa oficial (USD y EUR) directamente de bcv.org.ve y la guarda en rates.json.
// Lo ejecuta la GitHub Action .github/workflows/update-rates.yml cada 30 minutos.
// Sin dependencias: solo Node 20.
import https from 'node:https';
import { readFile, writeFile } from 'node:fs/promises';

const BCV_URL = 'https://www.bcv.org.ve/';
const OUT = new URL('../rates.json', import.meta.url);
const MAX_JUMP = 0.25; // rechaza saltos de más del 25 % respecto a la última tasa guardada

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
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado')));
    req.on('error', reject);
  });
}

// La web del BCV suele servir su certificado sin la cadena intermedia, y Node (a diferencia
// del navegador) no la completa solo. Primero se intenta con verificación; si falla solo por
// el certificado, se reintenta sin ella. Es una lectura de datos públicos (no se envía nada)
// y el valor se valida abajo contra la última tasa guardada.
async function fetchBcv() {
  try {
    return await get(BCV_URL);
  } catch (err) {
    if (!/certificate|self.signed|UNABLE_TO|CERT_/i.test(`${err.code} ${err.message}`)) throw err;
    console.warn(`Certificado del BCV no verificable (${err.code || err.message}); reintentando.`);
    return get(BCV_URL, { insecure: true });
  }
}

// En la portada, cada moneda está en <div id="dolar">…<strong class="strong-tb">888,11830000</strong>.
function pickRate(html, id) {
  const m = new RegExp(`id="${id}"[\\s\\S]*?<strong[^>]*>\\s*([\\d.,]+)\\s*</strong>`).exec(html);
  if (!m) return NaN;
  return Number(m[1].replace(/\./g, '').replace(',', '.'));
}

// "Fecha Valor: <span property="dc:date" … content="2026-11-10T00:00:00-04:00" …>".
// Se ancla al texto y no al orden de los atributos, que el BCV ya cambió una vez.
function pickDate(html) {
  const m = /Fecha Valor:[\s\S]{0,300}?content="(\d{4}-\d{2}-\d{2})/.exec(html);
  return m ? m[1] : null;
}

const round = (n) => Math.round(n * 1e4) / 1e4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Si el BCV no responde no es un error de la Action: la web usa DolarApi mientras tanto.
// Se avisa con ::warning:: (visible en Actions, sin correo) y se sale bien.
// En cambio, si responde pero no se entiende el HTML, sí falla: hay que actualizar el script.
function skip(msg) {
  console.log(`::warning::${msg}`);
  process.exit(0);
}

let html;
for (let attempt = 1; attempt <= 3 && !html; attempt++) {
  try {
    html = await fetchBcv();
  } catch (err) {
    console.warn(`Intento ${attempt}/3 fallido: ${err.code || ''} ${err.message}`);
    if (attempt < 3) await sleep(15000);
  }
}
if (!html) skip('La web del BCV no respondió tras 3 intentos; rates.json no cambia.');

const next = {
  fechaValor: pickDate(html),
  USD: round(pickRate(html, 'dolar')),
  EUR: round(pickRate(html, 'euro')),
};
if (!next.fechaValor || !(next.USD > 0) || !(next.EUR > 0)) {
  throw new Error(`No se pudo leer la tasa de la web del BCV (¿cambió su HTML?): ${JSON.stringify(next)}`);
}

let prev = null;
try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* primera ejecución */ }

if (prev?.USD > 0 && Math.abs(next.USD - prev.USD) / prev.USD > MAX_JUMP) {
  skip(`Salto sospechoso en USD: ${prev.USD} → ${next.USD}. No se guarda.`);
}

if (prev && prev.fechaValor === next.fechaValor && prev.USD === next.USD && prev.EUR === next.EUR) {
  console.log('Sin cambios:', next);
} else {
  const out = { ...next, fuente: 'bcv.org.ve', obtenido: new Date().toISOString() };
  await writeFile(OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log('Tasa actualizada:', out);
}
