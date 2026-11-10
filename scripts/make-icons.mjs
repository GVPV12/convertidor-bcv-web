// Genera los íconos PNG de la PWA dibujando el logo (el mismo del favicon) píxel a píxel.
// Chrome pide PNG de 192 y 512 px para ofrecer "Instalar app", y el iPhone necesita un
// apple-touch-icon en PNG. Sin dependencias: solo Node.
//
//   node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x04, 0x10, 0x1f];
const GRAD_A = [0xc4, 0xff, 0xf3];
const GRAD_B = [0x19, 0xc6, 0xe0];

// Todo en el espacio de 32×32 del favicon.
const RING = { cx: 16, cy: 16, r: 10, half: 1.1 };
const STROKE_HALF = 1; // el "$" tiene trazo 2
const SEGMENTS = [
  [16, 9.5, 16, 22.5],
  [19.2, 12.4, 14.8, 12.4],
  [14.8, 16.6, 17.2, 16.6],
  [17.2, 20.8, 12.6, 20.8],
];
// Medias circunferencias de la "S": centro y lado hacia el que se abren.
const ARCS = [
  { cx: 14.8, cy: 14.5, left: true },
  { cx: 17.2, cy: 18.7, left: false },
];
const ARC_R = 2.1;

function distSeg(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distArc(px, py, { cx, cy, left }) {
  if (left ? px <= cx : px >= cx) return Math.abs(Math.hypot(px - cx, py - cy) - ARC_R);
  return Math.min(Math.hypot(px - cx, py - (cy - ARC_R)), Math.hypot(px - cx, py - (cy + ARC_R)));
}

function onStroke(x, y) {
  if (Math.abs(Math.hypot(x - RING.cx, y - RING.cy) - RING.r) <= RING.half) return true;
  for (const s of SEGMENTS) if (distSeg(x, y, s) <= STROKE_HALF) return true;
  for (const a of ARCS) if (distArc(x, y, a) <= STROKE_HALF) return true;
  return false;
}

function inRoundedRect(x, y, rx) {
  const qx = Math.abs(x - 16) - (16 - rx);
  const qy = Math.abs(y - 16) - (16 - rx);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rx <= 0;
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// rounded: esquinas redondeadas y fondo transparente fuera (ícono normal).
// scale: tamaño del logo; los íconos "maskable" y de iPhone lo achican para dejar margen.
function render(size, { rounded, scale }) {
  const S = 4; // 4×4 muestras por píxel para bordes suaves
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const u = ((x + (i + 0.5) / S) / size) * 32;
          const v = ((y + (j + 0.5) / S) / size) * 32;
          if (rounded && !inRoundedRect(u, v, 9)) continue;
          const cu = 16 + (u - 16) / scale;
          const cv = 16 + (v - 16) / scale;
          let c = BG;
          if (onStroke(cu, cv)) {
            const t = Math.max(0, Math.min(1, ((cu - 6) + (cv - 6)) / 40));
            c = mix(GRAD_A, GRAD_B, t);
          }
          r += c[0]; g += c[1]; b += c[2]; a++;
        }
      }
      const o = (y * size + x) * 4;
      if (a) { px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a; }
      px[o + 3] = Math.round((a / (S * S)) * 255);
    }
  }
  return encodePng(size, size, px);
}

/* ---------------- PNG mínimo ---------------- */

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // sin filtro
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- Salida ---------------- */

const OUT = new URL('../icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const icons = {
  'icon-192.png': render(192, { rounded: true, scale: 1 }),
  'icon-512.png': render(512, { rounded: true, scale: 1 }),
  // Android recorta los "maskable" en círculo o gota: fondo completo y logo dentro del 80 %.
  'icon-maskable-512.png': render(512, { rounded: false, scale: 0.72 }),
  // iOS redondea las esquinas por su cuenta y no admite transparencia.
  'apple-touch-icon.png': render(180, { rounded: false, scale: 0.8 }),
};
for (const [name, png] of Object.entries(icons)) {
  writeFileSync(new URL(name, OUT), png);
  console.log(`icons/${name} (${png.length} bytes)`);
}
