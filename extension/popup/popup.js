// Lógica del popup de RespondePDF: subida de PDFs, lista, pregunta directa y ajustes.

import { guardarPdf, listarPdfs, eliminarPdf, eliminarTodos, cambiarActivo } from '../lib/db.js';
import { extraerTextoPdf } from '../lib/pdf-extract.js';

const { escaparHtml, markdownBasico, formatearTamano, htmlFuentes } = globalThis.RespondePDFFormat;
const URL_BACKEND_POR_DEFECTO = 'http://localhost:3000';

const $ = (id) => document.getElementById(id);

// ---------- Avisos ----------

let temporizadorAviso;
function avisar(texto, esError = false) {
  const aviso = $('aviso');
  aviso.textContent = texto;
  aviso.classList.toggle('error', esError);
  aviso.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (aviso.hidden = true), 3500);
}

// ---------- Pestañas ----------

function activarPestana(idPanel) {
  for (const pestana of document.querySelectorAll('.pestana')) {
    const activa = pestana.dataset.panel === idPanel;
    pestana.classList.toggle('activa', activa);
    pestana.setAttribute('aria-selected', String(activa));
  }
  for (const panel of document.querySelectorAll('.panel')) {
    panel.hidden = panel.id !== idPanel;
  }
}

for (const pestana of document.querySelectorAll('.pestana')) {
  pestana.addEventListener('click', () => activarPestana(pestana.dataset.panel));
}

// ---------- Lista de PDFs ----------

async function pintarLista() {
  const pdfs = await listarPdfs();
  const lista = $('lista-pdfs');
  lista.innerHTML = '';

  for (const pdf of pdfs) {
    const li = document.createElement('li');
    li.className = `pdf${pdf.enabled === false ? ' inactivo' : ''}`;
    li.innerHTML = `
      <input type="checkbox" ${pdf.enabled === false ? '' : 'checked'} title="Incluir en las consultas">
      <div class="pdf-info">
        <span class="pdf-nombre" title="${escaparHtml(pdf.name)}">${escaparHtml(pdf.name)}</span>
        <span class="pdf-meta">${pdf.pages} pág. · ${formatearTamano(pdf.size)} · ${pdf.chars.toLocaleString('es')} caracteres</span>
      </div>
      <button class="pdf-eliminar" type="button" title="Eliminar" aria-label="Eliminar ${escaparHtml(pdf.name)}">🗑</button>`;

    li.querySelector('input').addEventListener('change', async (e) => {
      await cambiarActivo(pdf.id, e.target.checked);
      li.classList.toggle('inactivo', !e.target.checked);
    });
    li.querySelector('.pdf-eliminar').addEventListener('click', async () => {
      await eliminarPdf(pdf.id);
      avisar(`Eliminado: ${pdf.name}`);
      pintarLista();
    });
    lista.appendChild(li);
  }

  $('contador').textContent = pdfs.length;
  $('lista-vacia').hidden = pdfs.length > 0;
  $('borrar-todos').hidden = pdfs.length < 2;
}

$('borrar-todos').addEventListener('click', async () => {
  if (!confirm('¿Eliminar todos los PDFs guardados?')) return;
  await eliminarTodos();
  pintarLista();
});

// ---------- Subida de PDFs ----------

function esPdf(archivo) {
  return archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
}

function mostrarProgreso(nombre, fraccion) {
  $('progreso').hidden = false;
  $('progreso-nombre').textContent = nombre;
  $('progreso-pct').textContent = `${Math.round(fraccion * 100)}%`;
  $('progreso-relleno').style.width = `${fraccion * 100}%`;
}

async function procesarArchivos(archivos) {
  const pdfs = [...archivos].filter(esPdf);
  const descartados = archivos.length - pdfs.length;
  if (descartados > 0) avisar(`${descartados} archivo(s) ignorado(s): solo se admiten PDFs.`, true);

  let correctos = 0;
  for (const [i, archivo] of pdfs.entries()) {
    const etiqueta = pdfs.length > 1 ? `(${i + 1}/${pdfs.length}) ${archivo.name}` : archivo.name;
    try {
      mostrarProgreso(etiqueta, 0);
      const { text, pages } = await extraerTextoPdf(archivo, (n, total) => mostrarProgreso(etiqueta, n / total));
      if (!text.trim()) {
        avisar(`"${archivo.name}" no contiene texto extraíble (¿es un escaneo?).`, true);
        continue;
      }
      await guardarPdf({ name: archivo.name, size: archivo.size, pages, text });
      correctos++;
      await pintarLista();
    } catch (err) {
      console.error('[RespondePDF] Error al procesar', archivo.name, err);
      const motivo = err?.name === 'PasswordException' ? 'está protegido con contraseña' : 'no se pudo leer';
      avisar(`"${archivo.name}" ${motivo}.`, true);
    }
  }

  $('progreso').hidden = true;
  if (correctos > 0) avisar(`${correctos} PDF(s) añadido(s) correctamente.`);
}

const zona = $('zona-soltar');
const selector = $('selector-archivos');

selector.addEventListener('change', () => {
  if (selector.files.length) procesarArchivos(selector.files);
  selector.value = '';
});

zona.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    selector.click();
  }
});

for (const evento of ['dragenter', 'dragover']) {
  zona.addEventListener(evento, (e) => {
    e.preventDefault();
    zona.classList.add('arrastrando');
  });
}
for (const evento of ['dragleave', 'drop']) {
  zona.addEventListener(evento, (e) => {
    e.preventDefault();
    zona.classList.remove('arrastrando');
  });
}
zona.addEventListener('drop', (e) => {
  if (e.dataTransfer?.files?.length) procesarArchivos(e.dataTransfer.files);
});
// Evitar que soltar un archivo fuera de la zona abra el PDF en el popup
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// ---------- Pregunta directa ----------

$('form-pregunta').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pregunta = $('pregunta').value.trim();
  if (!pregunta) return;

  const boton = $('boton-preguntar');
  const resultado = $('resultado');
  boton.disabled = true;
  boton.textContent = 'Buscando…';
  resultado.hidden = false;
  resultado.innerHTML = '<p>Buscando en tus PDFs…</p>';

  try {
    const r = await chrome.runtime.sendMessage({ type: 'RP_QUERY', prompt: pregunta });
    if (!r?.ok) {
      resultado.innerHTML = `<p class="rp-error">⚠️ ${escaparHtml(r?.error || 'Error desconocido.')}</p>`;
      if (r?.code === 'MISSING_API_KEY') activarPestana('panel-ajustes');
      return;
    }
    resultado.innerHTML = `
      ${markdownBasico(r.answer)}
      <p class="rp-titulo">Fuente${r.sources.length === 1 ? '' : 's'}</p>
      ${htmlFuentes(r.sources)}
      ${r.truncated ? '<p class="rp-aviso">Nota: algunos PDFs se analizaron parcialmente por su tamaño.</p>' : ''}`;
  } catch (err) {
    resultado.innerHTML = `<p class="rp-error">⚠️ ${escaparHtml(err.message)}</p>`;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Preguntar';
  }
});

// Enviar con Ctrl/Cmd + Enter
$('pregunta').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('form-pregunta').requestSubmit();
});

// ---------- Ajustes ----------

function normalizarUrl(url) {
  return url.trim().replace(/\/+$/, '');
}

async function comprobarBackend(url, silencioso = false) {
  const indicador = $('estado-backend');
  const r = await chrome.runtime.sendMessage({ type: 'RP_HEALTH', backendUrl: url });
  indicador.className = `estado ${r?.ok ? 'ok' : 'error'}`;
  indicador.title = r?.ok ? `Backend conectado (${url})` : `Backend no disponible (${url})`;
  if (!silencioso) avisar(r?.ok ? '✅ Backend conectado correctamente.' : `❌ ${r?.error || 'Sin respuesta.'}`, !r?.ok);
}

async function cargarAjustes() {
  const { backendUrl, apiKey } = await chrome.storage.local.get(['backendUrl', 'apiKey']);
  $('backend-url').value = backendUrl || URL_BACKEND_POR_DEFECTO;
  $('api-key').value = apiKey || '';
  // Si falta la API key, abrir directamente la pestaña de ajustes
  if (!apiKey) activarPestana('panel-ajustes');
  comprobarBackend($('backend-url').value, true);
}

$('form-ajustes').addEventListener('submit', async (e) => {
  e.preventDefault();
  const backendUrl = normalizarUrl($('backend-url').value) || URL_BACKEND_POR_DEFECTO;
  const apiKey = $('api-key').value.trim();
  try {
    new URL(backendUrl);
  } catch {
    avisar('La URL del backend no es válida.', true);
    return;
  }
  await chrome.storage.local.set({ backendUrl, apiKey });
  $('backend-url').value = backendUrl;
  avisar('Configuración guardada.');
  comprobarBackend(backendUrl, true);
});

$('probar-backend').addEventListener('click', () => {
  comprobarBackend(normalizarUrl($('backend-url').value) || URL_BACKEND_POR_DEFECTO);
});

$('ver-key').addEventListener('click', () => {
  const campo = $('api-key');
  campo.type = campo.type === 'password' ? 'text' : 'password';
});

// ---------- Inicio ----------

pintarLista();
cargarAjustes();
