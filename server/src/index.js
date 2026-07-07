// CodeLens API. This process does NOT import or start the worker (src/worker.js
// runs separately via `npm run worker`).
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

const authMiddleware = require('./middleware/auth');

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', authMiddleware, require('./routes/projects'));
app.use('/api', authMiddleware, require('./routes/audits').auditsRouter);

// Central error handler — no stack traces to clients.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;

if (require.main === module) {
  const assertEnv = require('./lib/assertEnv');
  assertEnv(['DATABASE_URL', 'JWT_SECRET', 'REDIS_URL', 'GEMINI_API_KEY']);
  const port = process.env.PORT || 3001;
  app.listen(port, () => console.log(`CodeLens API listening on :${port}`));
}
