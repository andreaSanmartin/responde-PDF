// Configuración del backend leída desde variables de entorno.
// Todos los valores tienen un valor por defecto razonable para que
// `docker compose up -d` funcione sin configurar nada.

function entero(valor, porDefecto) {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

module.exports = {
  // Puerto en el que escucha Express
  port: entero(process.env.PORT, 3000),

  // Modelo de Gemini a utilizar
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',

  // URL base de la API de Gemini (permite apuntar a otro endpoint compatible)
  geminiApiBase: (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, ''),

  // Máximo de peticiones por minuto y por IP a /api/query
  rateLimitPerMin: entero(process.env.RATE_LIMIT_PER_MIN, 30),

  // Límite de caracteres de texto de PDFs que se envían a Gemini
  maxContextChars: entero(process.env.MAX_CONTEXT_CHARS, 800000),

  // Tamaño máximo del cuerpo JSON aceptado
  bodyLimit: process.env.BODY_LIMIT || '25mb',

  // Tiempo máximo de espera de la respuesta de Gemini (ms)
  geminiTimeoutMs: entero(process.env.GEMINI_TIMEOUT_MS, 60000),

  // Orígenes permitidos para CORS ("*" = cualquiera). Lista separada por comas.
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean),

  // Número de proxies inversos delante del contenedor (para obtener la IP real)
  trustProxy: entero(process.env.TRUST_PROXY, 0),
};
