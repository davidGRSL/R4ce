# syntax=docker/dockerfile:1
FROM node:20-alpine

# python3/make/g++ son necesarios porque "bcrypt" es un módulo nativo:
# si no hay binario precompilado para musl (Alpine), npm lo compila con node-gyp.
RUN apk add --no-cache python3 make g++

RUN apk add --no-cache vips-dev
WORKDIR /app

# Copiamos primero solo los manifiestos para aprovechar la cache de capas de Docker:
# si no cambian package.json/lock, este paso no se vuelve a ejecutar en builds futuros.
COPY package*.json ./

# Incluye devDependencies (necesitamos nodemon para "npm run dev").
# Para una imagen de producción más ligera, separar en un build multi-stage
# con "npm ci --omit=dev" en la etapa final.
RUN npm install

# Copiamos el resto del código (en dev, ./backend/src se sobreescribe
# por el bind mount de docker-compose; esto deja la imagen funcional
# también si se ejecuta suelta, sin compose).
COPY . .

EXPOSE 3000

# Por defecto arranca en modo producción; docker-compose.yml lo sobreescribe
# con "command: npm run dev" para desarrollo con hot reload.
CMD ["npm", "start"]
