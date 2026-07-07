const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null, // BullMQ hard requirement (INV-3)
  ...(process.env.REDIS_URL?.startsWith('rediss://')
    ? { tls: { rejectUnauthorized: false } } // Upstash TLS (INV-3)
    : {}),
});

const auditQueue = new Queue('audits', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

module.exports = { auditQueue, connection };
