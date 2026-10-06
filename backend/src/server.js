// Servidor Express de RespondePDF.
// Actúa como proxy sin estado: recibe la pregunta, los textos de los PDFs
// y la API key del usuario, llama a Gemini y devuelve la respuesta.
// Nunca guarda ni registra la API key.

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { consultarGemini, HttpError } = require('./gemini');

const app = express();

app.disable('x-powered-by');
if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

// CORS: la extensión llama desde su propio origen (chrome-extension://...)
app.use(cors({ origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins }));

// Cuerpo JSON grande para admitir varios PDFs extensos
app.use(express.json({ limit: config.bodyLimit }));

// Comprobación de salud
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Limitador de peticiones por IP para el endpoint de consulta
const limitador = rateLimit({
  windowMs: 60 * 1000,
  limit: config.rateLimitPerMin,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'RATE_LIMIT',
      message: `Límite de ${config.rateLimitPerMin} peticiones por minuto alcanzado. Espera un momento.`,
    });
  },
});

// Valida el cuerpo de /api/query y devuelve los datos normalizados
function validarCuerpo(body) {
  const { prompt, apiKey, pdfTexts } = body || {};

  if (typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    throw new HttpError(401, 'MISSING_API_KEY', 'Falta la API key de Gemini. Configúrala en la extensión.');
  }
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new HttpError(400, 'MISSING_PROMPT', 'El campo "prompt" es obligatorio.');
  }
  if (!Array.isArray(pdfTexts) || pdfTexts.length === 0) {
    throw new HttpError(400, 'MISSING_PDFS', 'Debes enviar al menos un PDF en "pdfTexts".');
  }

  // Se aceptan objetos { name, text } o cadenas sueltas
  const pdfs = pdfTexts
    .map((p, i) =>
      typeof p === 'string'
        ? { name: `Documento ${i + 1}`, text: p }
        : { name: String(p?.name || `Documento ${i + 1}`), text: String(p?.text || '') }
    )
    .filter((p) => p.text.trim());

  if (pdfs.length === 0) {
    throw new HttpError(400, 'EMPTY_PDFS', 'Los PDFs enviados no contienen texto extraíble.');
  }

  return { prompt: prompt.trim().slice(0, 8000), apiKey: apiKey.trim(), pdfTexts: pdfs };
}

app.post('/api/query', limitador, async (req, res, next) => {
  try {
    const datos = validarCuerpo(req.body);
    const resultado = await consultarGemini(datos);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// Ruta no encontrada
app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Ruta no encontrada.' });
});

// Manejador central de errores
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: `El cuerpo supera el límite de ${config.bodyLimit}.` });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'INVALID_JSON', message: 'El cuerpo no es un JSON válido.' });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  console.error('[RespondePDF] Error inesperado:', err.message);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Error interno del servidor.' });
});

const servidor = app.listen(config.port, () => {
  console.log(`[RespondePDF] Backend escuchando en el puerto ${config.port} (modelo: ${config.geminiModel}, límite: ${config.rateLimitPerMin}/min)`);
});

// Apagado limpio al detener el contenedor
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => servidor.close(() => process.exit(0)));
}
