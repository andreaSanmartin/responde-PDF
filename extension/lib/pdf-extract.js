// Extracción de texto de PDFs con pdf.js de Mozilla (incluido localmente en lib/pdfjs).

import * as pdfjsLib from './pdfjs/pdf.min.mjs';

// El worker de pdf.js también se sirve desde la propia extensión
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdfjs/pdf.worker.min.mjs');

/**
 * Extrae el texto de un archivo PDF, página por página.
 * Cada página se marca con "[Página N]" para que Gemini pueda citarla.
 * @param {File} archivo
 * @param {(actual:number, total:number) => void} [alProgresar]
 * @returns {Promise<{text:string, pages:number}>}
 */
export async function extraerTextoPdf(archivo, alProgresar) {
  const datos = new Uint8Array(await archivo.arrayBuffer());
  const documento = await pdfjsLib.getDocument({
    data: datos,
    isEvalSupported: false, // requerido por la CSP de Manifest V3
  }).promise;

  const partes = [];
  try {
    for (let n = 1; n <= documento.numPages; n++) {
      const pagina = await documento.getPage(n);
      const contenido = await pagina.getTextContent();

      // Reconstruir líneas respetando los saltos de línea que indica pdf.js
      let texto = '';
      for (const item of contenido.items) {
        if (!('str' in item)) continue;
        texto += item.str;
        texto += item.hasEOL ? '\n' : ' ';
      }
      texto = texto.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

      if (texto) partes.push(`[Página ${n}]\n${texto}`);
      pagina.cleanup();
      alProgresar?.(n, documento.numPages);
    }
    return { text: partes.join('\n\n'), pages: documento.numPages };
  } finally {
    await documento.destroy();
  }
}
