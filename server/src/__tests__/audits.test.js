process.env.JWT_SECRET = 'test-secret';

jest.mock('../lib/prisma', () => ({
  user: { findUnique: jest.fn() },
  project: { findUnique: jest.fn(), update: jest.fn() },
  projectFile: { count: jest.fn() },
  audit: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  issue: { findUnique: jest.fn(), update: jest.fn() },
}));

jest.mock('../lib/queue', () => ({
  auditQueue: { add: jest.fn() },
  connection: {},
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { auditQueue } = require('../lib/queue');
const app = require('../index');

const token = jwt.sign({ id: 'user-1', email: 'a@b.com' }, 'test-secret');
const auth = { Authorization: `Bearer ${token}` };

beforeEach(() => jest.clearAllMocks());

describe('POST /api/projects/:id/audits (enqueue, never inline)', () => {
  beforeEach(() => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'user-1' });
    prisma.projectFile.count.mockResolvedValue(3);
    prisma.audit.create.mockResolvedValue({ id: 'audit-1' });
    prisma.audit.update.mockResolvedValue({});
    auditQueue.add.mockResolvedValue({ id: 'job-9' });
  });

  it('creates a queued Audit row, adds a BullMQ job, returns 202', async () => {
    prisma.audit.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/projects/p1/audits').set(auth).send({});

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ auditId: 'audit-1', jobId: 'job-9' });
    expect(prisma.audit.create).toHaveBeenCalledWith({
      data: { projectId: 'p1', status: 'queued', incremental: false, trigger: 'manual' },
    });
    expect(auditQueue.add).toHaveBeenCalledWith('audit', {
      auditId: 'audit-1',
      projectId: 'p1',
      incremental: false,
    });
  });

  it('defaults incremental to true when a prior completed audit exists', async () => {
    prisma.audit.findFirst.mockResolvedValue({ id: 'prev-audit' });
    await request(app).post('/api/projects/p1/audits').set(auth).send({});
    expect(prisma.audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ incremental: true }) })
    );
  });

  it('honors an explicit incremental: false', async () => {
    prisma.audit.findFirst.mockResolvedValue({ id: 'prev-audit' });
    await request(app).post('/api/projects/p1/audits').set(auth).send({ incremental: false });
    expect(prisma.audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ incremental: false }) })
    );
  });

  it('stores trigger: ci from the GitHub Action', async () => {
    prisma.audit.findFirst.mockResolvedValue(null);
    await request(app).post('/api/projects/p1/audits').set(auth).send({ trigger: 'ci' });
    expect(prisma.audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ trigger: 'ci' }) })
    );
  });

  it('rejects projects with no files', async () => {
    prisma.projectFile.count.mockResolvedValue(0);
    const res = await request(app).post('/api/projects/p1/audits').set(auth).send({});
    expect(res.status).toBe(400);
    expect(auditQueue.add).not.toHaveBeenCalled();
  });

  it('404s for another user project (INV-4)', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'other' });
    const res = await request(app).post('/api/projects/p1/audits').set(auth).send({});
    expect(res.status).toBe(404);
    expect(auditQueue.add).not.toHaveBeenCalled();
  });

  it('401s without a token (INV-4)', async () => {
    const res = await request(app).post('/api/projects/p1/audits').send({});
    expect(res.status).toBe(401);
  });
});

describe('GET /api/audits/:auditId', () => {
  it('returns audit with issues for the owner', async () => {
    prisma.audit.findUnique.mockResolvedValue({
      id: 'audit-1',
      status: 'completed',
      overallScore: 82,
      project: { userId: 'user-1', name: 'Proj' },
      issues: [{ id: 'i1', title: 'x', file: { id: 'f1', filename: 'a.js' } }],
    });
    const res = await request(app).get('/api/audits/audit-1').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.overallScore).toBe(82);
    expect(res.body.issues).toHaveLength(1);
    expect(res.body.projectName).toBe('Proj');
  });

  it('404s for another user audit (INV-4)', async () => {
    prisma.audit.findUnique.mockResolvedValue({
      id: 'audit-1',
      project: { userId: 'other', name: 'Proj' },
      issues: [],
    });
    const res = await request(app).get('/api/audits/audit-1').set(auth);
    expect(res.status).toBe(404);
  });

  it('401s without a token (INV-4)', async () => {
    const res = await request(app).get('/api/audits/audit-1');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/audits/:auditId/markdown', () => {
  it('formats a completed audit as markdown', async () => {
    prisma.audit.findUnique.mockResolvedValue({
      id: 'audit-1',
      status: 'completed',
      overallScore: 82,
      securityScore: 90,
      performanceScore: 80,
      maintainabilityScore: 85,
      debtScore: 70,
      complexityScore: 88,
      totalIssues: 2,
      criticalCount: 1,
      analyzedFileCount: 3,
      reusedFileCount: 5,
      project: { userId: 'user-1', name: 'Proj' },
      issues: [
        { severity: 'critical', category: 'security', title: 'SQLi', file: { filename: 'db.js' } },
      ],
    });
    const res = await request(app).get('/api/audits/audit-1/markdown').set(auth);
    expect(res.status).toBe(200);
    expect(res.text).toContain('## CodeLens Audit — Score: 82/100');
    expect(res.text).toContain('Analyzed 3 files, reused 5');
    expect(res.text).toContain('SQLi');
  });

  it('409s while the audit is still running', async () => {
    prisma.audit.findUnique.mockResolvedValue({
      id: 'audit-1',
      status: 'running',
      project: { userId: 'user-1', name: 'Proj' },
      issues: [],
    });
    const res = await request(app).get('/api/audits/audit-1/markdown').set(auth);
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/issues/:issueId/resolve', () => {
  it('toggles resolved for the owner', async () => {
    prisma.issue.findUnique.mockResolvedValue({
      id: 'i1',
      resolved: false,
      audit: { project: { userId: 'user-1' } },
    });
    prisma.issue.update.mockResolvedValue({ id: 'i1', resolved: true });
    const res = await request(app).patch('/api/issues/i1/resolve').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'i1', resolved: true });
    expect(prisma.issue.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { resolved: true },
    });
  });

  it('404s for another user issue (INV-4: issue → audit → project)', async () => {
    prisma.issue.findUnique.mockResolvedValue({
      id: 'i1',
      resolved: false,
      audit: { project: { userId: 'other' } },
    });
    const res = await request(app).patch('/api/issues/i1/resolve').set(auth);
    expect(res.status).toBe(404);
    expect(prisma.issue.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/projects/:id/audits (history)', () => {
  it('returns the audit history for the owner', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'user-1' });
    prisma.audit.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    const res = await request(app).get('/api/projects/p1/audits').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(prisma.audit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'p1' } })
    );
  });
});
