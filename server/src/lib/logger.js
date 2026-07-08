// Structured JSON logging (pino). LOG_LEVEL=debug|info|warn|error; silent
// under Jest so test output stays readable.
const pino = require('pino');

const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : process.env.LOG_LEVEL || 'info',
  base: undefined, // drop pid/hostname noise
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
