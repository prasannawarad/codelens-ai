// Demo seed: a user, a realistic project and four backdated completed audits
// showing an improving debt trend. Idempotent — re-running wipes and recreates
// the demo account. Usage: npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const { analyzeStaticMetrics } = require('../src/services/staticMetrics');
const { calculateOverallScore } = require('../src/services/scoring');
const { sha256, countLines } = require('../src/lib/hash');
const { detectLanguage } = require('../src/lib/lang');

const DEMO_EMAIL = 'demo@codelens.dev';
const DEMO_PASSWORD = 'codelens-demo';

const FILES = {
  'src/server.js': `const express = require('express');
const payments = require('./routes/payments');
const webhooks = require('./routes/webhooks');

const app = express();
app.use(express.json());
app.use('/payments', payments);
app.use('/webhooks', webhooks);

app.get('/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4000;
app.listen(port, () => console.info(\`acme-payments-api on :\${port}\`));
`,
  'src/db.js': `const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function findCharge(id) {
  const { rows } = await pool.query('SELECT * FROM charges WHERE id = $1', [id]);
  return rows[0] || null;
}

async function insertCharge(charge) {
  const { rows } = await pool.query(
    'INSERT INTO charges (amount, currency, card_last4) VALUES ($1, $2, $3) RETURNING *',
    [charge.amount, charge.currency, charge.cardLast4]
  );
  return rows[0];
}

module.exports = { pool, findCharge, insertCharge };
`,
  'src/routes/payments.js': `const express = require('express');
const { insertCharge, findCharge } = require('../db');
const { validateCharge } = require('../utils/validate');

const router = express.Router();

router.post('/', async (req, res) => {
  const errors = validateCharge(req.body);
  if (errors.length) return res.status(400).json({ errors });
  const charge = await insertCharge(req.body);
  console.log('created charge', charge.id);
  res.status(201).json(charge);
});

router.get('/:id', async (req, res) => {
  const charge = await findCharge(req.params.id);
  if (!charge) return res.status(404).json({ error: 'Not found' });
  res.json(charge);
});

module.exports = router;
`,
  'src/routes/webhooks.js': `const express = require('express');

const router = express.Router();

// TODO: add retry handling with exponential backoff for failed deliveries
router.post('/stripe', (req, res) => {
  const event = req.body;
  console.log('webhook event', event.type);
  res.json({ received: true });
});

module.exports = router;
`,
  'src/utils/validate.js': `function validateCharge(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return ['Body must be an object'];
  if (!Number.isInteger(body.amount) || body.amount <= 0) {
    errors.push('amount must be a positive integer (cents)');
  }
  if (typeof body.currency !== 'string' || body.currency.length !== 3) {
    errors.push('currency must be a 3-letter code');
  }
  if (body.card && typeof body.card.last4 !== 'string') {
    errors.push('card.last4 must be a string');
  }
  return errors;
}

module.exports = { validateCharge };
`,
  'src/schema.sql': `CREATE TABLE IF NOT EXISTS charges (
  id SERIAL PRIMARY KEY,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  card_last4 TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
`,
};

const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

// Master issue catalog with a lifecycle across the four audits.
const CATALOG = {
  eval: {
    filename: 'src/routes/payments.js', category: 'security', severity: 'critical',
    title: 'Use of eval() on request input',
    description: 'Charge metadata was evaluated with eval(), allowing arbitrary code execution from request bodies.',
    suggestion: 'Parse metadata with JSON.parse inside a try/catch instead.', line: 9,
  },
  key: {
    filename: 'src/server.js', category: 'security', severity: 'high',
    title: 'Hardcoded Stripe secret key',
    description: 'A live Stripe secret key was committed in source.',
    suggestion: 'Move the key to an environment variable and rotate it.', line: 4,
  },
  sqli: {
    filename: 'src/db.js', category: 'security', severity: 'high',
    title: 'SQL built by string concatenation',
    description: 'Charge lookups interpolated user input directly into SQL, enabling injection.',
    suggestion: 'Use parameterized queries ($1 placeholders) everywhere.', line: 6,
  },
  todoIdem: {
    filename: 'src/routes/payments.js', category: 'debt', severity: 'medium',
    title: 'Unresolved TODO: idempotency keys',
    description: 'Charge creation is not idempotent; client retries can double-charge.',
    suggestion: 'Accept an Idempotency-Key header and dedupe on it.', line: 7,
  },
  todoRetry: {
    filename: 'src/routes/webhooks.js', category: 'debt', severity: 'medium',
    title: 'Unresolved TODO: webhook retry handling',
    description: 'Failed webhook deliveries are dropped; the TODO has no ticket.',
    suggestion: 'Queue failed deliveries with exponential backoff.', line: 5,
  },
  nullref: {
    filename: 'src/utils/validate.js', category: 'bug', severity: 'medium',
    title: 'Null dereference on missing card field',
    description: 'validateCharge read body.card.last4 without checking body.card exists.',
    suggestion: 'Guard the optional card object before reading its fields.', line: 11,
  },
  logPay: {
    filename: 'src/routes/payments.js', category: 'style', severity: 'low',
    title: 'Debug output left in code',
    description: 'console.log ships charge ids to stdout in production.',
    suggestion: 'Use a structured logger with levels.', line: 12,
  },
  logHook: {
    filename: 'src/routes/webhooks.js', category: 'style', severity: 'low',
    title: 'Debug output left in code',
    description: 'Webhook payload types are logged with console.log.',
    suggestion: 'Use a structured logger with levels.', line: 8,
  },
  logSrv: {
    filename: 'src/server.js', category: 'style', severity: 'low',
    title: 'Ad-hoc request logging',
    description: 'Startup and request logging bypass any log framework.',
    suggestion: 'Adopt pino or winston with JSON output.', line: 13,
  },
};

const AUDITS = [
  {
    age: 21, incremental: false, analyzed: 6, reused: 0,
    scores: { security: 48, performance: 62, maintainability: 55, debt: 50 },
    issues: ['eval', 'key', 'sqli', 'todoIdem', 'todoRetry', 'nullref', 'logPay', 'logHook', 'logSrv'],
    summary: 'Initial audit: two exploitable security holes (eval on request input, hardcoded Stripe key) plus SQL injection risk in the charge store. Debt is concentrated in payments idempotency and webhook retries.',
  },
  {
    age: 14, incremental: true, analyzed: 2, reused: 4,
    scores: { security: 68, performance: 66, maintainability: 62, debt: 58 },
    issues: ['sqli', 'todoIdem', 'todoRetry', 'nullref', 'logPay', 'logHook', 'logSrv'],
    summary: 'eval() removed and the Stripe key rotated into env config. SQL concatenation in db.js remains the top risk; debt items unchanged.',
  },
  {
    age: 7, incremental: true, analyzed: 2, reused: 4,
    scores: { security: 78, performance: 74, maintainability: 72, debt: 68 },
    issues: ['todoIdem', 'todoRetry', 'nullref', 'logPay', 'logHook'],
    summary: 'Charge queries are now parameterized and server logging was consolidated. Remaining findings are medium debt (idempotency, webhook retries) and a validation edge case.',
  },
  {
    age: 2, incremental: true, analyzed: 2, reused: 4,
    scores: { security: 90, performance: 82, maintainability: 80, debt: 78 },
    issues: ['todoRetry', 'logPay', 'logHook'],
    summary: 'Idempotency landed and the card validation null path is guarded. What is left is webhook retry debt and two logging cleanups — a healthy trajectory.',
  },
];

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    await prisma.project.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      name: 'Demo Reviewer',
    },
  });

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: 'acme-payments-api',
      description: 'Payments service — seeded demo showing a three-week debt paydown',
      language: 'javascript',
      createdAt: daysAgo(22),
    },
  });

  const fileIdByName = new Map();
  for (const [filename, content] of Object.entries(FILES)) {
    const file = await prisma.projectFile.create({
      data: {
        projectId: project.id,
        filename,
        content,
        contentHash: sha256(content),
        language: detectLanguage(filename),
        lineCount: countLines(content),
        source: 'upload',
      },
    });
    fileIdByName.set(filename, file.id);
  }

  const staticMetrics = analyzeStaticMetrics(
    Object.entries(FILES).map(([filename, content]) => ({
      filename,
      content,
      contentHash: sha256(content),
    }))
  );

  let latest = null;
  for (const spec of AUDITS) {
    const issues = spec.issues.map((k) => CATALOG[k]);
    const overallScore = calculateOverallScore(spec.scores, staticMetrics.complexityScore);
    const when = daysAgo(spec.age);
    const audit = await prisma.audit.create({
      data: {
        projectId: project.id,
        status: 'completed',
        trigger: 'manual',
        incremental: spec.incremental,
        analyzedFileCount: spec.analyzed,
        reusedFileCount: spec.reused,
        overallScore,
        securityScore: spec.scores.security,
        performanceScore: spec.scores.performance,
        maintainabilityScore: spec.scores.maintainability,
        debtScore: spec.scores.debt,
        complexityScore: staticMetrics.complexityScore,
        staticMetrics,
        summary: spec.summary,
        totalIssues: issues.length,
        criticalCount: issues.filter((i) => i.severity === 'critical').length,
        createdAt: when,
        completedAt: when,
      },
    });
    await prisma.issue.createMany({
      data: issues.map((issue) => ({
        auditId: audit.id,
        fileId: fileIdByName.get(issue.filename) ?? null,
        category: issue.category,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        suggestion: issue.suggestion,
        lineNumber: issue.line,
        resolved: false,
        createdAt: when,
      })),
    });
    latest = { spec, when };
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { debtScore: latest.spec.scores.debt, lastAuditAt: latest.when },
  });

  console.log('Seeded demo account:');
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log(`  project:  acme-payments-api (${Object.keys(FILES).length} files, ${AUDITS.length} audits)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
