const express = require('express');
const prisma = require('../lib/prisma');
const { findOwnedProject } = require('../lib/ownership');
const { detectLanguage } = require('../lib/lang');
const { sha256, countLines } = require('../lib/hash');

// Mounted at /api/projects/:id/files — mergeParams exposes :id.
const router = express.Router({ mergeParams: true });

// Ownership gate for every file route (INV-4).
router.use(async (req, res, next) => {
  try {
    const project = await findOwnedProject(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    req.project = project;
    next();
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:id/files — add file(s): [{filename, content}] or a
// single {filename, content}. Upserts on (projectId, filename).
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const source = typeof body.source === 'string' ? body.source : 'upload';
    const entries = Array.isArray(body) ? body : Array.isArray(body.files) ? body.files : [body];
    if (
      entries.length === 0 ||
      entries.some((f) => !f || typeof f.filename !== 'string' || typeof f.content !== 'string')
    ) {
      return res.status(400).json({ error: 'Expected [{filename, content}]' });
    }
    const saved = [];
    for (const { filename, content } of entries) {
      const data = {
        content,
        contentHash: sha256(content),
        language: detectLanguage(filename),
        lineCount: countLines(content),
        source,
      };
      saved.push(
        await prisma.projectFile.upsert({
          where: { projectId_filename: { projectId: req.project.id, filename } },
          create: { projectId: req.project.id, filename, ...data },
          update: data,
          select: { id: true, filename: true, language: true, lineCount: true, contentHash: true, source: true },
        })
      );
    }
    res.status(201).json({ files: saved });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id/files/:fileId — full file content
router.get('/:fileId', async (req, res, next) => {
  try {
    const file = await prisma.projectFile.findUnique({ where: { id: req.params.fileId } });
    if (!file || file.projectId !== req.project.id) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.json(file);
  } catch (err) {
    next(err);
  }
});

// PUT /api/projects/:id/files/:fileId — replace content, recompute hash + lineCount
router.put('/:fileId', async (req, res, next) => {
  try {
    const { content } = req.body || {};
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }
    const file = await prisma.projectFile.findUnique({ where: { id: req.params.fileId } });
    if (!file || file.projectId !== req.project.id) {
      return res.status(404).json({ error: 'File not found' });
    }
    const updated = await prisma.projectFile.update({
      where: { id: file.id },
      data: { content, contentHash: sha256(content), lineCount: countLines(content) },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:fileId', async (req, res, next) => {
  try {
    const file = await prisma.projectFile.findUnique({ where: { id: req.params.fileId } });
    if (!file || file.projectId !== req.project.id) {
      return res.status(404).json({ error: 'File not found' });
    }
    await prisma.projectFile.delete({ where: { id: file.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
