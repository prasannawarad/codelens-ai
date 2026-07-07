// BullMQ audit worker — separate process (`npm run worker`). The API process
// never imports this file.
require('dotenv').config();
const { Worker } = require('bullmq');
const prisma = require('./lib/prisma');
const { connection } = require('./lib/queue');
const { analyzeStaticMetrics } = require('./services/staticMetrics');
const { runGeminiAudit } = require('./services/gemini');
const { calculateOverallScore } = require('./services/scoring');
const { partitionFiles, carryForwardIssues } = require('./services/incremental');

async function processAudit(job) {
  const { auditId, projectId, incremental } = job.data;
  await prisma.audit.update({ where: { id: auditId }, data: { status: 'running' } });

  try {
    // 2. Load all project files.
    const files = await prisma.projectFile.findMany({
      where: { projectId },
      select: { id: true, filename: true, language: true, content: true, contentHash: true },
    });
    if (files.length === 0) throw new Error('Project has no files to audit');
    const fileIdByName = new Map(files.map((f) => [f.filename, f.id]));

    // 3. Incremental partition — only when requested AND a prior completed
    // audit with a perFile snapshot exists.
    let prevAudit = null;
    if (incremental) {
      prevAudit = await prisma.audit.findFirst({
        where: { projectId, status: 'completed', id: { not: auditId } },
        orderBy: { createdAt: 'desc' },
        include: {
          issues: { include: { file: { select: { filename: true } } } },
        },
      });
    }
    const prevPerFile = prevAudit?.staticMetrics?.perFile;
    const isIncremental = Boolean(prevAudit && Array.isArray(prevPerFile));
    const { changed, unchanged } = isIncremental
      ? partitionFiles(files, prevPerFile)
      : { changed: files, unchanged: [] };

    // 4. Static metrics for ALL files (cheap, deterministic). perFile entries
    // carry contentHash — the snapshot the next incremental audit diffs against.
    const staticMetrics = analyzeStaticMetrics(files);

    // 5. AI analysis on changed files only; skip Gemini entirely and reuse the
    // previous AI scores when nothing changed.
    let aiResult;
    if (isIncremental && changed.length === 0) {
      aiResult = {
        scores: {
          security: prevAudit.securityScore ?? 100,
          performance: prevAudit.performanceScore ?? 100,
          maintainability: prevAudit.maintainabilityScore ?? 100,
          debt: prevAudit.debtScore ?? 100,
        },
        issues: [],
        summary: prevAudit.summary || 'No files changed since the previous audit.',
      };
    } else {
      aiResult = await runGeminiAudit(
        changed.map((f) => ({ filename: f.filename, language: f.language, content: f.content }))
      );
    }

    // Carry forward unchanged files' unresolved issues as fresh rows.
    const carried = isIncremental
      ? carryForwardIssues(prevAudit.issues, unchanged.map((f) => f.filename))
      : [];
    const allIssues = [...aiResult.issues, ...carried];

    // 6. Weighted overall score (INV-1).
    const overallScore = calculateOverallScore(aiResult.scores, staticMetrics.complexityScore);
    const criticalCount = allIssues.filter((i) => i.severity === 'critical').length;

    // 7. INV-2: Issue rows + Audit completion + Project debtScore/lastAuditAt
    // persist in ONE transaction.
    await prisma.$transaction(async (tx) => {
      await tx.issue.createMany({
        data: allIssues.map((issue) => ({
          auditId,
          fileId: fileIdByName.get(issue.filename) ?? null,
          category: issue.category,
          severity: issue.severity,
          title: issue.title,
          description: issue.description,
          suggestion: issue.suggestion || null,
          lineNumber: issue.line_number ?? null,
          resolved: false,
        })),
      });
      await tx.audit.update({
        where: { id: auditId },
        data: {
          status: 'completed',
          incremental: isIncremental,
          analyzedFileCount: changed.length,
          reusedFileCount: unchanged.length,
          overallScore,
          securityScore: aiResult.scores.security,
          performanceScore: aiResult.scores.performance,
          maintainabilityScore: aiResult.scores.maintainability,
          debtScore: aiResult.scores.debt,
          complexityScore: staticMetrics.complexityScore,
          staticMetrics,
          summary: aiResult.summary,
          totalIssues: allIssues.length,
          criticalCount,
          completedAt: new Date(),
        },
      });
      await tx.project.update({
        where: { id: projectId },
        data: { debtScore: aiResult.scores.debt, lastAuditAt: new Date() },
      });
    });

    return { auditId, overallScore, totalIssues: allIssues.length };
  } catch (err) {
    // 8. Mark failed with the error message, rethrow so BullMQ records it.
    await prisma.audit.update({
      where: { id: auditId },
      data: {
        status: 'failed',
        errorMessage: String(err.message || err).slice(0, 2000),
        completedAt: new Date(),
      },
    });
    throw err;
  }
}

module.exports = { processAudit };

if (require.main === module) {
  const assertEnv = require('./lib/assertEnv');
  assertEnv(['DATABASE_URL', 'REDIS_URL', 'GEMINI_API_KEY']);

  const worker = new Worker('audits', processAudit, { connection, concurrency: 2 });
  worker.on('completed', (job) => console.log(`[worker] audit job ${job.id} completed`));
  worker.on('failed', (job, err) =>
    console.error(`[worker] audit job ${job?.id} failed: ${err.message}`)
  );
  console.log('[worker] CodeLens audit worker listening on queue "audits"');

  const shutdown = async () => {
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
