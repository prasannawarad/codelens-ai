const express = require('express');
const prisma = require('../lib/prisma');
const { findOwnedProject } = require('../lib/ownership');

const router = express.Router();

const AUDIT_SUMMARY_SELECT = {
  id: true,
  status: true,
  incremental: true,
  overallScore: true,
  debtScore: true,
  totalIssues: true,
  criticalCount: true,
  createdAt: true,
  completedAt: true,
};

// GET /api/projects — current user's projects with latest audit summaries
// (last 5, newest first — [0] is the latest, the rest feed the sparkline).
router.get('/', async (req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        audits: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: AUDIT_SUMMARY_SELECT,
        },
        _count: { select: { files: true } },
      },
    });
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const project = await prisma.project.create({
      data: { userId: req.user.id, name, description: description || null },
    });
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id — project + file metadata (no content) + last 10 audits
router.get('/:id', async (req, res, next) => {
  try {
    const project = await findOwnedProject(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const [files, audits] = await Promise.all([
      prisma.projectFile.findMany({
        where: { projectId: project.id },
        select: { id: true, filename: true, language: true, lineCount: true, source: true, updatedAt: true },
        orderBy: { filename: 'asc' },
      }),
      prisma.audit.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: AUDIT_SUMMARY_SELECT,
      }),
    ]);
    res.json({ ...project, files, audits });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const project = await findOwnedProject(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { name, description } = req.body || {};
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const project = await findOwnedProject(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    await prisma.project.delete({ where: { id: project.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.use('/:id/files', require('./files'));

module.exports = router;
