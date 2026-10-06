// Cliente mínimo para la API REST de Gemini (generateContent).
// No almacena la API key: se recibe en cada llamada y se descarta.

const config = require('./config');

// Error con código HTTP para que el servidor lo traduzca a la respuesta adecuada
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Construye el bloque de contexto con el texto de cada PDF, respetando el límite de caracteres
function construirContexto(pdfTexts) {
  const presupuestoPorPdf = Math.floor(config.maxContextChars / pdfTexts.length);
  let truncado = false;

  const bloques = pdfTexts.map((pdf, i) => {
    let texto = pdf.text;
    if (texto.length > presupuestoPorPdf) {
      texto = texto.slice(0, presupuestoPorPdf);
      truncado = true;
    }
    return `<<<DOCUMENTO ${i + 1}: "${pdf.name}">>>\n${texto}\n<<<FIN DOCUMENTO ${i + 1}>>>`;
  });

  return { contexto: bloques.join('\n\n'), truncado };
}

const INSTRUCCIONES = [
  'Eres RespondePDF, un asistente que responde preguntas usando EXCLUSIVAMENTE el contenido de los documentos PDF proporcionados.',
  'Reglas:',
  '1. Responde en el mismo idioma de la pregunta, de forma clara y concisa.',
  '2. Si la respuesta no aparece en los documentos, dilo explícitamente y no inventes información.',
  '3. En "sources" indica cada documento usado: su nombre exacto, la página si aparece un marcador [Página N], y una cita breve y literal (máx. 200 caracteres).',
  '4. Si no usaste ningún documento, devuelve "sources" como lista vacía.',
].join('\n');

// Esquema de salida estructurada que se le pide a Gemini
const ESQUEMA_RESPUESTA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    sources: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          page: { type: 'INTEGER', nullable: true },
          quote: { type: 'STRING' },
        },
        required: ['name'],
      },
    },
  },
  required: ['answer', 'sources'],
};

// Traduce los errores de Gemini a códigos HTTP propios
function traducirErrorGemini(status, cuerpo) {
  const mensaje = cuerpo?.error?.message || `Gemini respondió con estado ${status}`;
  const razon = JSON.stringify(cuerpo?.error?.details || []);

  if (razon.includes('API_KEY_INVALID') || status === 401 || status === 403) {
    return new HttpError(401, 'INVALID_API_KEY', 'La API key de Gemini no es válida o no tiene permisos.');
  }
  if (status === 429) {
    return new HttpError(429, 'GEMINI_RATE_LIMIT', 'Se alcanzó la cuota de Gemini para esta API key. Intenta más tarde.');
  }
  if (status === 400) {
    return new HttpError(400, 'GEMINI_BAD_REQUEST', mensaje);
  }
  if (status === 404) {
    return new HttpError(502, 'GEMINI_MODEL_NOT_FOUND', `Modelo "${config.geminiModel}" no disponible: ${mensaje}`);
  }
  return new HttpError(502, 'GEMINI_ERROR', mensaje);
}

// Intenta parsear la respuesta JSON del modelo; si falla, devuelve el texto plano
function parsearSalida(texto, nombresPdf) {
  try {
    const limpio = texto.replace(/^```(?:json)?\s*|\s*```$/g, '');
    const datos = JSON.parse(limpio);
    const sources = Array.isArray(datos.sources) ? datos.sources : [];
    return {
      answer: String(datos.answer ?? '').trim(),
      sources: sources
        .filter((s) => s && typeof s.name === 'string')
        .map((s) => ({
          name: s.name,
          page: Number.isInteger(s.page) ? s.page : null,
          quote: typeof s.quote === 'string' ? s.quote : '',
        })),
    };
  } catch {
    // Respaldo: buscar nombres de PDF mencionados en el texto
    return {
      answer: texto.trim(),
      sources: nombresPdf.filter((n) => texto.includes(n)).map((name) => ({ name, page: null, quote: '' })),
    };
  }
}

async function consultarGemini({ prompt, apiKey, pdfTexts }) {
  const { contexto, truncado } = construirContexto(pdfTexts);
  const url = `${config.geminiApiBase}/models/${encodeURIComponent(config.geminiModel)}:generateContent`;

  const cuerpo = {
    systemInstruction: { parts: [{ text: INSTRUCCIONES }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: `DOCUMENTOS:\n\n${contexto}\n\nPREGUNTA:\n${prompt}` }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: ESQUEMA_RESPUESTA,
    },
  };

  let respuesta;
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(config.geminiTimeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new HttpError(504, 'GEMINI_TIMEOUT', 'Gemini tardó demasiado en responder.');
    }
    throw new HttpError(502, 'GEMINI_UNREACHABLE', `No se pudo contactar con Gemini: ${err.message}`);
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw traducirErrorGemini(respuesta.status, datos);
  }

  const candidato = datos.candidates?.[0];
  const texto = candidato?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!texto) {
    const motivo = datos.promptFeedback?.blockReason || candidato?.finishReason || 'desconocido';
    throw new HttpError(502, 'GEMINI_EMPTY', `Gemini no devolvió respuesta (motivo: ${motivo}).`);
  }

  const resultado = parsearSalida(texto, pdfTexts.map((p) => p.name));
  return { ...resultado, truncated: truncado, model: config.geminiModel };
}

module.exports = { consultarGemini, HttpError };
