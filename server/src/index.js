// CodeLens API. This process does NOT import or start the worker (src/worker.js
// runs separately via `npm run worker`).
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const pinoHttp = require('pino-http');
const logger = require('./lib/logger');

const app = express();
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    autoLogging: { ignore: (req) => req.url === '/health' },
  })
);
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

const authMiddleware = require('./middleware/auth');

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', authMiddleware, require('./routes/projects'));
app.use('/api/admin', authMiddleware, require('./routes/admin'));
app.use('/api', authMiddleware, require('./routes/audits').auditsRouter);

// Central error handler — no stack traces to clients.
app.use((err, req, res, next) => {
  (req.log || logger).error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;

if (require.main === module) {
  const assertEnv = require('./lib/assertEnv');
  assertEnv(['DATABASE_URL', 'JWT_SECRET', 'REDIS_URL', 'GEMINI_API_KEY']);
  const port = process.env.PORT || 3001;
  const server = app.listen(port, () => logger.info(`CodeLens API listening on :${port}`));

  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      const prisma = require('./lib/prisma');
      const { connection } = require('./lib/queue');
      await prisma.$disconnect();
      await connection.quit().catch(() => {});
      process.exit(0);
    });
    // Hard exit if connections refuse to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
