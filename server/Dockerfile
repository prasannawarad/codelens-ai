FROM node:20-alpine
# Prisma's query/schema engines link against OpenSSL, which alpine omits.
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY scripts ./scripts
COPY eval ./eval

EXPOSE 3001
# API by default; the worker service overrides the command.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
