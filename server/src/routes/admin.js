const express = require('express');
const prisma = require('../lib/prisma');
const { auditQueue } = require('../lib/queue');

const router = express.Router();

// GET /api/admin/stats — operational snapshot for the Settings "System" card.
// Queue counts are process-wide; audit aggregates are scoped to the caller's
// own projects (INV-4 spirit: no cross-user data, even in aggregates).
router.get('/stats', async (req, res, next) => {
  try {
    const [queueCounts, byStatus, recent] = await Promise.all([
      auditQueue
        .getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
        .catch(() => null), // Redis down → report null rather than 500
      prisma.audit.groupBy({
        by: ['status'],
        where: { project: { userId: req.user.id } },
        _count: { _all: true },
      }),
      prisma.audit.findMany({
        where: { project: { userId: req.user.id }, status: 'completed' },
        orderBy: { completedAt: 'desc' },
        take: 20,
        select: { createdAt: true, completedAt: true },
      }),
    ]);
    const durations = recent
      .filter((a) => a.completedAt)
      .map((a) => new Date(a.completedAt) - new Date(a.createdAt));
    const avgAuditMs = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;
    res.json({
      queue: queueCounts,
      audits: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      avgAuditMs,
      sampledAudits: durations.length,
      uptimeSec: Math.round(process.uptime()),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
