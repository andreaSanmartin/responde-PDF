// Genera los iconos de la extensión (16, 48 y 128 px): libro abierto + lápiz
// con la paleta otoñal. No usa dependencias: rasteriza formas vectoriales
// con supermuestreo (antialiasing) y codifica el PNG con zlib.
// Uso: npm run icons

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Paleta otoñal (RGB)
const C = {
  quemado: [194, 87, 27],    // #C2571B
  calabaza: [224, 122, 63],  // #E07A3F
  cafe: [92, 58, 33],        // #5C3A21
  caramelo: [184, 134, 11],  // #B8860B
  crema: [245, 230, 211],    // #F5E6D3
  profundo: [62, 39, 35],    // #3E2723
};

// ---------- Geometría básica ----------

function dentroPoligono(x, y, pts) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function distSegmento(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function distBorde(x, y, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) d = Math.min(d, distSegmento(x, y, pts[i], pts[(i + 1) % pts.length]));
  return d;
}

function dentroRectRedondeado(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return Math.hypot(x - cx, y - cy) <= r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function mezclar(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

// ---------- Escena (coordenadas normalizadas 0..1, y hacia abajo) ----------

// Páginas del libro abierto
const paginaIzq = [[0.13, 0.33], [0.49, 0.39], [0.49, 0.83], [0.13, 0.77]];
const paginaDer = [[0.51, 0.39], [0.87, 0.33], [0.87, 0.77], [0.51, 0.83]];
// Tapa del libro (detrás de las páginas)
const tapa = [[0.09, 0.36], [0.5, 0.43], [0.91, 0.36], [0.91, 0.82], [0.5, 0.89], [0.09, 0.82]];

// Lápiz definido en coordenadas locales (t = a lo largo, s = ancho)
const lapizIni = [0.9, 0.08];
const lapizFin = [0.56, 0.62];
const L = Math.hypot(lapizFin[0] - lapizIni[0], lapizFin[1] - lapizIni[1]);
const dir = [(lapizFin[0] - lapizIni[0]) / L, (lapizFin[1] - lapizIni[1]) / L];
const nor = [-dir[1], dir[0]];
const hw = 0.06; // medio ancho del lápiz
const aGlobal = ([t, s]) => [lapizIni[0] + dir[0] * t + nor[0] * s, lapizIni[1] + dir[1] * t + nor[1] * s];

const lapizContorno = [[0, -hw], [0.76 * L, -hw], [L, 0], [0.76 * L, hw], [0, hw]].map(aGlobal);
const lapizCuerpo = [[0.16 * L, -hw], [0.76 * L, -hw], [0.76 * L, hw], [0.16 * L, hw]].map(aGlobal);
const lapizBrillo = [[0.16 * L, -hw * 0.15], [0.76 * L, -hw * 0.15], [0.76 * L, hw], [0.16 * L, hw]].map(aGlobal);
const lapizCasquillo = [[0, -hw], [0.16 * L, -hw], [0.16 * L, hw], [0, hw]].map(aGlobal);
const lapizMadera = [[0.76 * L, -hw], [L, 0], [0.76 * L, hw]].map(aGlobal);
const lapizGrafito = [[0.9 * L, -hw * 0.42], [L, 0], [0.9 * L, hw * 0.42]].map(aGlobal);

// Devuelve [r, g, b, a] del punto (x, y)
function colorEn(x, y, tam) {
  // Grosor de los trazos: más grueso en tamaños pequeños para que se lean
  const trazo = tam <= 16 ? 0.045 : tam <= 48 ? 0.03 : 0.022;

  // Fondo: cuadrado redondeado con degradado naranja
  if (!dentroRectRedondeado(x, y, 0.02, 0.02, 0.98, 0.98, 0.2)) return [0, 0, 0, 0];
  let col = mezclar(C.calabaza, C.quemado, y);

  // Libro
  if (dentroPoligono(x, y, tapa)) col = C.cafe;
  if (dentroPoligono(x, y, paginaIzq) || dentroPoligono(x, y, paginaDer)) {
    col = C.crema;
    // Renglones de texto (solo en iconos medianos y grandes)
    if (tam >= 48) {
      for (let k = 0; k < 5; k++) {
        const base = 0.47 + k * 0.065;
        const enIzq = x > 0.18 && x < 0.45 && Math.abs(y - (base + (x - 0.13) * 0.166)) < 0.009;
        const enDer = x > 0.55 && x < 0.82 && Math.abs(y - (base + (0.87 - x) * 0.166)) < 0.009;
        if ((enIzq && k < 5) || (enDer && k < 3)) col = mezclar(C.crema, C.caramelo, 0.55);
      }
    }
  }
  // Lomo central
  if (Math.abs(x - 0.5) < trazo * 0.5 && y > 0.39 && y < 0.86) col = C.profundo;
  // Contorno de las páginas
  if (distBorde(x, y, paginaIzq) < trazo * 0.5 || distBorde(x, y, paginaDer) < trazo * 0.5) col = C.profundo;

  // Lápiz
  if (dentroPoligono(x, y, lapizContorno) || distBorde(x, y, lapizContorno) < trazo) {
    col = C.profundo;
    if (dentroPoligono(x, y, lapizCuerpo)) col = C.caramelo;
    if (dentroPoligono(x, y, lapizBrillo)) col = mezclar(C.caramelo, C.calabaza, 0.35);
    if (dentroPoligono(x, y, lapizCasquillo)) col = C.calabaza;
    if (dentroPoligono(x, y, lapizMadera)) col = C.crema;
    if (dentroPoligono(x, y, lapizGrafito)) col = C.profundo;
    // Separaciones internas del lápiz
    if (distSegmento(x, y, aGlobal([0.16 * L, -hw]), aGlobal([0.16 * L, hw])) < trazo * 0.5) col = C.profundo;
    if (distSegmento(x, y, aGlobal([0.76 * L, -hw]), aGlobal([0.76 * L, hw])) < trazo * 0.4) col = C.profundo;
    // Contorno exterior
    if (distBorde(x, y, lapizContorno) < trazo * 0.5) col = C.profundo;
  }

  return [...col, 255];
}

// ---------- Rasterizado y PNG ----------

function rasterizar(tam) {
  const sub = tam <= 16 ? 8 : 4; // submuestras por eje
  const datos = Buffer.alloc(tam * tam * 4);
  for (let py = 0; py < tam; py++) {
    for (let px = 0; px < tam; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const [cr, cg, cb, ca] = colorEn((px + (sx + 0.5) / sub) / tam, (py + (sy + 0.5) / sub) / tam, tam);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (py * tam + px) * 4;
      const n = sub * sub;
      datos[i] = a ? Math.round(r / a) : 0;
      datos[i + 1] = a ? Math.round(g / a) : 0;
      datos[i + 2] = a ? Math.round(b / a) : 0;
      datos[i + 3] = Math.round(a / n);
    }
  }
  return datos;
}

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloque(tipo, datos) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([len, cuerpo, crc]);
}

function codificarPNG(tam, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0);
  ihdr.writeUInt32BE(tam, 4);
  ihdr[8] = 8;  // bits por canal
  ihdr[9] = 6;  // RGBA
  // Cada fila va precedida del byte de filtro 0 (ninguno)
  const filas = Buffer.alloc(tam * (tam * 4 + 1));
  for (let y = 0; y < tam; y++) rgba.copy(filas, y * (tam * 4 + 1) + 1, y * tam * 4, (y + 1) * tam * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', zlib.deflateSync(filas, { level: 9 })),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

const destino = path.join(__dirname, '..', 'extension', 'icons');
fs.mkdirSync(destino, { recursive: true });
for (const tam of [16, 48, 128]) {
  fs.writeFileSync(path.join(destino, `icon${tam}.png`), codificarPNG(tam, rasterizar(tam)));
  console.log(`Generado extension/icons/icon${tam}.png`);
}
