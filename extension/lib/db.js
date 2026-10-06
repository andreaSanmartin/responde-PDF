// Capa de acceso a IndexedDB para guardar los PDFs (texto extraído y metadatos).
// Se usa IndexedDB en lugar de chrome.storage porque admite volúmenes grandes.
// La comparten el popup y el service worker (mismo origen de la extensión).

const NOMBRE_DB = 'respondepdf';
const VERSION_DB = 1;
const ALMACEN = 'pdfs';

let promesaDb = null;

// Abre (o crea) la base de datos una sola vez
function abrirDb() {
  if (promesaDb) return promesaDb;
  promesaDb = new Promise((resolve, reject) => {
    const peticion = indexedDB.open(NOMBRE_DB, VERSION_DB);
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        const almacen = db.createObjectStore(ALMACEN, { keyPath: 'id' });
        almacen.createIndex('addedAt', 'addedAt');
      }
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => {
      promesaDb = null;
      reject(peticion.error);
    };
  });
  return promesaDb;
}

// Ejecuta una operación dentro de una transacción y devuelve su resultado
async function operar(modo, accion) {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, modo);
    const peticion = accion(tx.objectStore(ALMACEN));
    tx.oncomplete = () => resolve(peticion?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transacción abortada'));
  });
}

/**
 * Guarda un PDF procesado.
 * @param {{name:string, size:number, pages:number, text:string}} pdf
 */
export async function guardarPdf(pdf) {
  const registro = {
    id: crypto.randomUUID(),
    name: pdf.name,
    size: pdf.size,
    pages: pdf.pages,
    chars: pdf.text.length,
    text: pdf.text,
    enabled: true,
    addedAt: Date.now(),
  };
  await operar('readwrite', (s) => s.put(registro));
  return registro;
}

// Lista los PDFs SIN el texto (para pintar la lista rápidamente)
export async function listarPdfs() {
  const todos = await operar('readonly', (s) => s.getAll());
  return (todos || [])
    .sort((a, b) => a.addedAt - b.addedAt)
    .map(({ text, ...meta }) => meta);
}

// Devuelve nombre y texto de los PDFs activos (para enviar al backend)
export async function obtenerTextosActivos() {
  const todos = await operar('readonly', (s) => s.getAll());
  return (todos || [])
    .filter((p) => p.enabled !== false)
    .sort((a, b) => a.addedAt - b.addedAt)
    .map((p) => ({ name: p.name, text: p.text }));
}

// Activa o desactiva un PDF para las consultas
export async function cambiarActivo(id, enabled) {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite');
    const almacen = tx.objectStore(ALMACEN);
    const peticion = almacen.get(id);
    peticion.onsuccess = () => {
      if (peticion.result) almacen.put({ ...peticion.result, enabled });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function eliminarPdf(id) {
  await operar('readwrite', (s) => s.delete(id));
}

export async function eliminarTodos() {
  await operar('readwrite', (s) => s.clear());
}
