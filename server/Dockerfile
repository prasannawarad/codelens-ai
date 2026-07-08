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
# One image, two roles: the API (default) runs migrations then serves;
# a service with SERVICE_ROLE=worker runs the BullMQ worker instead.
# (docker-compose overrides the command explicitly; Railway uses this switch.)
CMD ["sh", "-c", "if [ \"$SERVICE_ROLE\" = \"worker\" ]; then node src/worker.js; else npx prisma migrate deploy && node src/index.js; fi"]
