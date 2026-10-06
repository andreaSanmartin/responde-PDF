// Content script de RespondePDF.
// Detecta el texto seleccionado en cualquier página, muestra el botón flotante
// "Buscar en RespondePDF" y presenta la respuesta en una ventana flotante.
// Toda la interfaz vive en un Shadow DOM para no heredar ni romper estilos de la página.

(() => {
  // Evitar doble inyección (por ejemplo, en recargas del content script)
  if (window.__respondePdfCargado) return;
  window.__respondePdfCargado = true;

  const { escaparHtml, markdownBasico, htmlFuentes } = globalThis.RespondePDFFormat;
  const LONGITUD_MINIMA = 3;
  const ICONO = chrome.runtime.getURL('icons/icon48.png');

  // ---------- Contenedor con Shadow DOM ----------

  const anfitrion = document.createElement('respondepdf-root');
  anfitrion.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  const raiz = anfitrion.attachShadow({ mode: 'open' });

  raiz.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .rp {
        --quemado: rgb(194, 87, 27);
        --calabaza: rgb(224, 122, 63);
        --cafe: rgb(92, 58, 33);
        --caramelo: rgb(184, 134, 11);
        --crema: rgb(245, 230, 211);
        --profundo: rgb(62, 39, 35);
        font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: var(--profundo);
      }
      .rp-boton {
        position: fixed;
        display: none;
        align-items: center;
        gap: 6px;
        padding: 6px 12px 6px 6px;
        border: none;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--calabaza), var(--quemado));
        color: var(--crema);
        font: 600 13px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 4px 14px rgba(62, 39, 35, .35);
        cursor: pointer;
        animation: aparecer .15s ease-out;
      }
      .rp-boton:hover { filter: brightness(1.08); }
      .rp-boton img { width: 20px; height: 20px; border-radius: 5px; }
      .rp-panel {
        position: fixed;
        display: none;
        flex-direction: column;
        width: min(420px, calc(100vw - 32px));
        max-height: min(560px, calc(100vh - 32px));
        background: var(--crema);
        border: 1px solid rgba(92, 58, 33, .25);
        border-radius: 14px;
        box-shadow: 0 18px 50px rgba(62, 39, 35, .35);
        overflow: hidden;
        animation: aparecer .18s ease-out;
      }
      .rp-cabecera {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: linear-gradient(135deg, var(--quemado), var(--cafe));
        color: var(--crema);
        cursor: move;
        user-select: none;
      }
      .rp-cabecera img { width: 22px; height: 22px; border-radius: 5px; }
      .rp-cabecera strong { flex: 1; font-size: 14px; letter-spacing: .2px; }
      .rp-cabecera button {
        border: none; background: transparent; color: var(--crema);
        font-size: 18px; line-height: 1; cursor: pointer; padding: 2px 6px; border-radius: 6px;
      }
      .rp-cabecera button:hover { background: rgba(245, 230, 211, .18); }
      .rp-cuerpo { padding: 12px 14px 14px; overflow-y: auto; }
      .rp-pregunta {
        margin: 0 0 12px;
        padding: 8px 10px;
        border-left: 3px solid var(--calabaza);
        background: rgba(224, 122, 63, .1);
        border-radius: 0 8px 8px 0;
        font-style: italic;
        color: var(--cafe);
        max-height: 90px;
        overflow: auto;
        word-break: break-word;
      }
      .rp-respuesta p { margin: 0 0 8px; }
      .rp-respuesta ul { margin: 0 0 8px; padding-left: 20px; }
      .rp-titulo {
        margin: 14px 0 6px; font-size: 11px; font-weight: 700;
        text-transform: uppercase; letter-spacing: .8px; color: var(--quemado);
      }
      .rp-fuentes { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
      .rp-fuentes li {
        padding: 8px 10px; background: #fff8ef;
        border: 1px solid rgba(184, 134, 11, .35); border-radius: 8px;
      }
      .rp-pdf { font-weight: 600; color: var(--cafe); word-break: break-word; }
      .rp-pagina { color: var(--caramelo); font-weight: 600; }
      .rp-fuentes blockquote { margin: 4px 0 0; font-size: 12.5px; color: var(--cafe); opacity: .85; }
      .rp-sin-fuentes { font-size: 12.5px; color: var(--cafe); opacity: .8; margin: 0; }
      .rp-aviso { margin-top: 10px; font-size: 12px; color: var(--caramelo); }
      .rp-error {
        padding: 10px 12px; border-radius: 8px;
        background: rgba(194, 87, 27, .12); border: 1px solid rgba(194, 87, 27, .4);
        color: var(--profundo);
      }
      .rp-cargando { display: flex; align-items: center; gap: 10px; color: var(--cafe); }
      .rp-spinner {
        width: 18px; height: 18px; border-radius: 50%;
        border: 3px solid rgba(224, 122, 63, .3); border-top-color: var(--quemado);
        animation: girar .8s linear infinite;
      }
      .rp-acciones { display: flex; justify-content: flex-end; margin-top: 12px; }
      .rp-acciones button {
        border: 1px solid var(--quemado); background: transparent; color: var(--quemado);
        font: 600 12px/1 system-ui, sans-serif; padding: 6px 10px; border-radius: 6px; cursor: pointer;
      }
      .rp-acciones button:hover { background: var(--quemado); color: var(--crema); }
      @keyframes girar { to { transform: rotate(360deg); } }
      @keyframes aparecer { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    </style>
    <div class="rp">
      <button class="rp-boton" type="button" title="Buscar el texto seleccionado en tus PDFs">
        <img src="${ICONO}" alt="">Buscar en RespondePDF
      </button>
      <section class="rp-panel" role="dialog" aria-label="Respuesta de RespondePDF">
        <header class="rp-cabecera">
          <img src="${ICONO}" alt="">
          <strong>RespondePDF</strong>
          <button class="rp-cerrar" type="button" title="Cerrar" aria-label="Cerrar">×</button>
        </header>
        <div class="rp-cuerpo"></div>
      </section>
    </div>`;

  const boton = raiz.querySelector('.rp-boton');
  const panel = raiz.querySelector('.rp-panel');
  const cuerpo = raiz.querySelector('.rp-cuerpo');
  const cabecera = raiz.querySelector('.rp-cabecera');

  // Se añade al documento al primer uso para no tocar páginas donde no se usa
  function montar() {
    if (!anfitrion.isConnected) document.documentElement.appendChild(anfitrion);
  }

  let textoSeleccionado = '';
  let consultaActual = 0;

  // ---------- Detección de selección ----------

  function leerSeleccion() {
    const activo = document.activeElement;
    // Texto seleccionado dentro de un campo de texto
    if (activo && (activo.tagName === 'TEXTAREA' || (activo.tagName === 'INPUT' && /^(text|search|url)$/i.test(activo.type)))) {
      try {
        return activo.value.slice(activo.selectionStart, activo.selectionEnd).trim();
      } catch {
        return '';
      }
    }
    return (window.getSelection()?.toString() || '').trim();
  }

  function mostrarBoton(x, y) {
    montar();
    const ancho = 200;
    const izquierda = Math.min(Math.max(8, x + 8), window.innerWidth - ancho - 8);
    const arriba = y + 44 > window.innerHeight ? y - 44 : y + 12;
    boton.style.left = `${izquierda}px`;
    boton.style.top = `${Math.max(8, arriba)}px`;
    boton.style.display = 'inline-flex';
  }

  function ocultarBoton() {
    boton.style.display = 'none';
  }

  document.addEventListener('mouseup', (e) => {
    // Ignorar clics dentro de nuestra propia interfaz
    if (e.composedPath().includes(anfitrion)) return;
    // Esperar a que el navegador actualice la selección
    setTimeout(() => {
      const texto = leerSeleccion();
      if (texto.length >= LONGITUD_MINIMA) {
        textoSeleccionado = texto;
        mostrarBoton(e.clientX, e.clientY);
      } else {
        ocultarBoton();
      }
    }, 10);
  }, true);

  document.addEventListener('mousedown', (e) => {
    if (!e.composedPath().includes(anfitrion)) ocultarBoton();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ocultarBoton();
      cerrarPanel();
    }
  });

  window.addEventListener('scroll', ocultarBoton, { passive: true });

  boton.addEventListener('click', () => {
    ocultarBoton();
    preguntar(textoSeleccionado);
  });

  // ---------- Ventana flotante ----------

  function abrirPanel() {
    montar();
    if (panel.style.display !== 'flex') {
      panel.style.left = `${Math.max(16, window.innerWidth - Math.min(420, window.innerWidth - 32) - 16)}px`;
      panel.style.top = '16px';
      panel.style.display = 'flex';
    }
  }

  function cerrarPanel() {
    panel.style.display = 'none';
    consultaActual++; // descartar respuestas pendientes
  }

  raiz.querySelector('.rp-cerrar').addEventListener('click', cerrarPanel);

  // Arrastrar la ventana desde la cabecera
  cabecera.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const inicio = { x: e.clientX, y: e.clientY, left: panel.offsetLeft, top: panel.offsetTop };
    cabecera.setPointerCapture(e.pointerId);
    const mover = (ev) => {
      const left = Math.min(Math.max(0, inicio.left + ev.clientX - inicio.x), window.innerWidth - 80);
      const top = Math.min(Math.max(0, inicio.top + ev.clientY - inicio.y), window.innerHeight - 40);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };
    const soltar = () => {
      cabecera.removeEventListener('pointermove', mover);
      cabecera.removeEventListener('pointerup', soltar);
    };
    cabecera.addEventListener('pointermove', mover);
    cabecera.addEventListener('pointerup', soltar);
  });

  function htmlPregunta(pregunta) {
    const corta = pregunta.length > 400 ? `${pregunta.slice(0, 400)}…` : pregunta;
    return `<p class="rp-pregunta">${escaparHtml(corta)}</p>`;
  }

  // Envía la pregunta al service worker y pinta el resultado
  async function preguntar(pregunta) {
    if (!pregunta) return;
    const id = ++consultaActual;
    abrirPanel();
    cuerpo.innerHTML = `${htmlPregunta(pregunta)}
      <div class="rp-cargando"><span class="rp-spinner"></span>Buscando en tus PDFs…</div>`;

    let resultado;
    try {
      resultado = await chrome.runtime.sendMessage({ type: 'RP_QUERY', prompt: pregunta });
    } catch (err) {
      resultado = { ok: false, error: 'La extensión se actualizó o reinició. Recarga la página e inténtalo de nuevo.' };
    }
    if (id !== consultaActual) return; // el usuario cerró o lanzó otra consulta

    if (!resultado?.ok) {
      cuerpo.innerHTML = `${htmlPregunta(pregunta)}<div class="rp-error">⚠️ ${escaparHtml(resultado?.error || 'Error desconocido.')}</div>`;
      return;
    }

    cuerpo.innerHTML = `${htmlPregunta(pregunta)}
      <div class="rp-respuesta">${markdownBasico(resultado.answer)}</div>
      <p class="rp-titulo">Fuente${resultado.sources.length === 1 ? '' : 's'}</p>
      ${htmlFuentes(resultado.sources)}
      ${resultado.truncated ? '<p class="rp-aviso">Nota: algunos PDFs eran muy extensos y se analizaron parcialmente.</p>' : ''}
      <div class="rp-acciones"><button type="button" class="rp-copiar">Copiar respuesta</button></div>`;

    cuerpo.querySelector('.rp-copiar').addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(resultado.answer);
        e.target.textContent = '¡Copiado!';
      } catch {
        e.target.textContent = 'No se pudo copiar';
      }
    });
  }

  // Peticiones desde el menú contextual (vía service worker)
  chrome.runtime.onMessage.addListener((mensaje) => {
    if (mensaje?.type === 'RP_ASK') preguntar(String(mensaje.prompt || '').trim());
  });
})();
