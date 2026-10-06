// Utilidades de formato compartidas entre el popup y el content script.
// Es un script clásico (no módulo) para poder cargarlo como content script;
// expone sus funciones en globalThis.RespondePDFFormat.

(() => {
  // Escapa HTML para insertar texto de forma segura
  function escaparHtml(texto) {
    return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // Convierte un Markdown muy básico (negritas, cursivas, listas, párrafos) en HTML seguro
  function markdownBasico(texto) {
    const lineas = escaparHtml(texto).split(/\r?\n/);
    let html = '';
    let enLista = false;

    for (const linea of lineas) {
      const item = linea.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (item) {
        if (!enLista) { html += '<ul>'; enLista = true; }
        html += `<li>${item[1]}</li>`;
        continue;
      }
      if (enLista) { html += '</ul>'; enLista = false; }
      if (linea.trim()) html += `<p>${linea}</p>`;
    }
    if (enLista) html += '</ul>';

    return html
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  }

  // Formatea bytes en una unidad legible
  function formatearTamano(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Genera el HTML de la lista de fuentes (PDF, página y cita)
  function htmlFuentes(fuentes) {
    if (!fuentes?.length) return '<p class="rp-sin-fuentes">No se identificó un PDF de origen para esta respuesta.</p>';
    return `<ul class="rp-fuentes">${fuentes
      .map((f) => {
        const pagina = f.page ? ` <span class="rp-pagina">· pág. ${f.page}</span>` : '';
        const cita = f.quote ? `<blockquote>“${escaparHtml(f.quote)}”</blockquote>` : '';
        return `<li><span class="rp-pdf">📄 ${escaparHtml(f.name)}</span>${pagina}${cita}</li>`;
      })
      .join('')}</ul>`;
  }

  globalThis.RespondePDFFormat = { escaparHtml, markdownBasico, formatearTamano, htmlFuentes };
})();
