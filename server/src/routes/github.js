const express = require('express');
const prisma = require('../lib/prisma');
const { findOwnedProject } = require('../lib/ownership');
const { importGithubRepo } = require('../services/githubImport');
const { decryptSecret } = require('../lib/secretBox');

// Mounted at /api/projects/:id/github (mergeParams).
const router = express.Router({ mergeParams: true });

// POST /api/projects/:id/github/import — body {repoUrl, branch?}
router.post('/import', async (req, res, next) => {
  try {
    const project = await findOwnedProject(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { repoUrl, branch } = req.body || {};
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { githubToken: true },
    });
    const result = await importGithubRepo(
      project.id,
      repoUrl,
      branch,
      decryptSecret(user?.githubToken) || null
    );
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
