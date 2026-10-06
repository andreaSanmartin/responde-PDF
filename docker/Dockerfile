# Imagen del backend de RespondePDF.
# Se construye desde la RAÍZ del repositorio (el contexto es "."):
#   docker build -f docker/Dockerfile -t respondepdf/backend:latest .
# Este archivo SOLO se usa para construir la imagen; el usuario final
# únicamente descarga la imagen publicada con docker-compose.yml.

FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Instalar dependencias primero para aprovechar la caché de capas
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar el código fuente
COPY backend/src ./src

# Ejecutar con un usuario sin privilegios
USER node

EXPOSE 3000

# Comprobación de salud usando el endpoint /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "src/server.js"]
