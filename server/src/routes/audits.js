const express = require('express');
const prisma = require('../lib/prisma');
const { findOwnedProject } = require('../lib/ownership');
const { auditQueue } = require('../lib/queue');
const { formatPrComment } = require('../services/prComment');

// --- Project-scoped: mounted at /api/projects/:id/audits (mergeParams) ---
const projectAuditsRouter = express.Router({ mergeParams: true });

projectAuditsRouter.use(async (req, res, next) => {
  try {
    const project = await findOwnedProject(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    req.project = project;
    next();
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:id/audits — enqueue an audit job. Never runs inline.
projectAuditsRouter.post('/', async (req, res, next) => {
  try {
    const projectId = req.project.id;
    const fileCount = await prisma.projectFile.count({ where: { projectId } });
    if (fileCount === 0) {
      return res.status(400).json({ error: 'Project has no files to audit' });
    }
    const prior = await prisma.audit.findFirst({
      where: { projectId, status: 'completed' },
      select: { id: true },
    });
    const body = req.body || {};
    // Default incremental to true when a prior completed audit exists.
    const incremental =
      typeof body.incremental === 'boolean' ? body.incremental : Boolean(prior);
    const trigger = body.trigger === 'ci' ? 'ci' : 'manual';

    const audit = await prisma.audit.create({
      data: { projectId, status: 'queued', incremental, trigger },
    });
    const job = await auditQueue.add('audit', {
      auditId: audit.id,
      projectId,
      incremental,
    });
    await prisma.audit.update({
      where: { id: audit.id },
      data: { jobId: String(job.id) },
    });
    res.status(202).json({ auditId: audit.id, jobId: String(job.id) });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id/audits — audit history (DebtTimeline)
projectAuditsRouter.get('/', async (req, res, next) => {
  try {
    const audits = await prisma.audit.findMany({
      where: { projectId: req.project.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        trigger: true,
        incremental: true,
        analyzedFileCount: true,
        reusedFileCount: true,
        overallScore: true,
        securityScore: true,
        performanceScore: true,
        maintainabilityScore: true,
        debtScore: true,
        complexityScore: true,
        totalIssues: true,
        criticalCount: true,
        createdAt: true,
        completedAt: true,
      },
    });
    res.json(audits);
  } catch (err) {
    next(err);
  }
});

// --- Global: mounted at /api (audits/:auditId, issues/:issueId) ---
const auditsRouter = express.Router();

// Ownership via audit → project (INV-4); 404 on foreign/missing.
async function findOwnedAudit(auditId, userId, includeIssues) {
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: {
      project: { select: { userId: true, name: true } },
      ...(includeIssues
        ? {
            issues: {
              include: { file: { select: { id: true, filename: true } } },
              orderBy: { createdAt: 'asc' },
            },
          }
        : {}),
    },
  });
  if (!audit || audit.project.userId !== userId) return null;
  return audit;
}

// GET /api/audits/:auditId — poll target: status + scores + issues
auditsRouter.get('/audits/:auditId', async (req, res, next) => {
  try {
    const audit = await findOwnedAudit(req.params.auditId, req.user.id, true);
    if (!audit) return res.status(404).json({ error: 'Audit not found' });
    const { project, ...rest } = audit;
    res.json({ ...rest, projectName: project.name });
  } catch (err) {
    next(err);
  }
});

// GET /api/audits/:auditId/markdown — PR comment body for the GitHub Action
auditsRouter.get('/audits/:auditId/markdown', async (req, res, next) => {
  try {
    const audit = await findOwnedAudit(req.params.auditId, req.user.id, true);
    if (!audit) return res.status(404).json({ error: 'Audit not found' });
    if (audit.status !== 'completed') {
      return res.status(409).json({ error: `Audit is ${audit.status}, not completed` });
    }
    res.type('text/markdown').send(formatPrComment(audit, audit.issues));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/issues/:issueId/resolve — toggle resolved
// (ownership via issue → audit → project)
auditsRouter.patch('/issues/:issueId/resolve', async (req, res, next) => {
  try {
    const issue = await prisma.issue.findUnique({
      where: { id: req.params.issueId },
      include: { audit: { include: { project: { select: { userId: true } } } } },
    });
    if (!issue || issue.audit.project.userId !== req.user.id) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    const updated = await prisma.issue.update({
      where: { id: issue.id },
      data: { resolved: !issue.resolved },
    });
    res.json({ id: updated.id, resolved: updated.resolved });
  } catch (err) {
    next(err);
  }
});

module.exports = { projectAuditsRouter, auditsRouter };
