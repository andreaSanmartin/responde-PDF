// Copia pdf.js (pdfjs-dist) dentro de la extensión para incluirlo localmente.
// Uso: npm install && npm run vendor:pdfjs

const fs = require('fs');
const path = require('path');

const origen = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build');
const destino = path.join(__dirname, '..', 'extension', 'lib', 'pdfjs');
const archivos = ['pdf.min.mjs', 'pdf.worker.min.mjs'];

fs.mkdirSync(destino, { recursive: true });
for (const archivo of archivos) {
  fs.copyFileSync(path.join(origen, archivo), path.join(destino, archivo));
  console.log(`Copiado ${archivo} → extension/lib/pdfjs/`);
}

// Copiar también la licencia de pdf.js (Apache 2.0)
const licencia = path.join(origen, '..', 'LICENSE');
if (fs.existsSync(licencia)) fs.copyFileSync(licencia, path.join(destino, 'LICENSE'));
