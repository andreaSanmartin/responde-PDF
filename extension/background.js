// Service worker de RespondePDF.
// Recibe las preguntas (desde el content script o el popup), reúne los textos
// de los PDFs guardados en IndexedDB, los envía al backend junto con la API key
// del usuario y devuelve la respuesta para mostrarla en la ventana flotante.

import { obtenerTextosActivos } from './lib/db.js';

const URL_BACKEND_POR_DEFECTO = 'http://localhost:3000';
const ID_MENU = 'respondepdf-buscar';

// Lee la configuración guardada por el popup
async function leerConfiguracion() {
  const { backendUrl, apiKey } = await chrome.storage.local.get(['backendUrl', 'apiKey']);
  return {
    backendUrl: (backendUrl || URL_BACKEND_POR_DEFECTO).replace(/\/+$/, ''),
    apiKey: apiKey || '',
  };
}

// Envía la pregunta al backend y normaliza la respuesta o el error
async function consultar(prompt) {
  const pregunta = String(prompt || '').trim();
  if (!pregunta) return { ok: false, error: 'La pregunta está vacía.' };

  const { backendUrl, apiKey } = await leerConfiguracion();
  if (!apiKey) {
    return { ok: false, code: 'MISSING_API_KEY', error: 'Configura tu API key de Gemini en el popup de RespondePDF (pestaña Ajustes).' };
  }

  const pdfTexts = await obtenerTextosActivos();
  if (pdfTexts.length === 0) {
    return { ok: false, code: 'NO_PDFS', error: 'No hay PDFs activos. Sube al menos un PDF desde el popup de RespondePDF.' };
  }

  let respuesta;
  try {
    respuesta = await fetch(`${backendUrl}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: pregunta, apiKey, pdfTexts }),
    });
  } catch {
    return { ok: false, code: 'BACKEND_UNREACHABLE', error: `No se pudo conectar con el backend en ${backendUrl}. ¿Está en ejecución?` };
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const porDefecto = {
      401: 'La API key de Gemini no es válida.',
      413: 'Los PDFs son demasiado grandes para el backend. Desactiva alguno e inténtalo de nuevo.',
      429: 'Demasiadas peticiones. Espera un momento.',
    };
    return {
      ok: false,
      status: respuesta.status,
      code: datos.error,
      error: datos.message || porDefecto[respuesta.status] || `Error del backend (${respuesta.status}).`,
    };
  }

  return {
    ok: true,
    answer: datos.answer || '',
    sources: Array.isArray(datos.sources) ? datos.sources : [],
    truncated: Boolean(datos.truncated),
  };
}

// Comprueba que el backend responde en /health
async function probarBackend(url) {
  const base = (url || (await leerConfiguracion()).backendUrl).replace(/\/+$/, '');
  try {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    const datos = await r.json().catch(() => ({}));
    return r.ok && datos.status === 'ok'
      ? { ok: true }
      : { ok: false, error: `El servidor respondió con estado ${r.status}.` };
  } catch {
    return { ok: false, error: `No hay respuesta en ${base}.` };
  }
}

// Mensajería con el content script y el popup
chrome.runtime.onMessage.addListener((mensaje, _remitente, responder) => {
  if (mensaje?.type === 'RP_QUERY') {
    consultar(mensaje.prompt)
      .then(responder)
      .catch((err) => responder({ ok: false, error: err.message || 'Error inesperado.' }));
    return true; // respuesta asíncrona
  }
  if (mensaje?.type === 'RP_HEALTH') {
    probarBackend(mensaje.backendUrl).then(responder);
    return true;
  }
  return false;
});

// Menú contextual sobre texto seleccionado
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: ID_MENU,
      title: 'Buscar en RespondePDF: "%s"',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== ID_MENU || !tab?.id) return;
  // El content script abre la ventana flotante y lanza la consulta
  chrome.tabs.sendMessage(tab.id, { type: 'RP_ASK', prompt: info.selectionText }).catch(() => {
    // Páginas donde no hay content script (chrome://, tienda de extensiones...)
  });
});
