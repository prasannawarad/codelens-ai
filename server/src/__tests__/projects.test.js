process.env.JWT_SECRET = 'test-secret';

jest.mock('../lib/prisma', () => ({
  user: { findUnique: jest.fn(), create: jest.fn() },
  project: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  projectFile: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  audit: { findMany: jest.fn() },
}));

const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const app = require('../index');

const token = jwt.sign({ id: 'user-1', email: 'a@b.com' }, 'test-secret');
const auth = { Authorization: `Bearer ${token}` };

beforeEach(() => jest.clearAllMocks());

describe('auth wall (INV-4)', () => {
  it.each([
    ['get', '/api/projects'],
    ['post', '/api/projects'],
    ['get', '/api/projects/p1'],
    ['post', '/api/projects/p1/files'],
    ['get', '/api/projects/p1/files/f1'],
  ])('%s %s without token → 401', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/projects', () => {
  it('lists only the current user projects', async () => {
    prisma.project.findMany.mockResolvedValue([{ id: 'p1', name: 'A' }]);
    const res = await request(app).get('/api/projects').set(auth);
    expect(res.status).toBe(200);
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
  });
});

describe('POST /api/projects', () => {
  it('creates a project for the current user', async () => {
    prisma.project.create.mockResolvedValue({ id: 'p1', name: 'A', userId: 'user-1' });
    const res = await request(app).post('/api/projects').set(auth).send({ name: 'A' });
    expect(res.status).toBe(201);
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', name: 'A', description: null },
    });
  });

  it('rejects a missing name', async () => {
    const res = await request(app).post('/api/projects').set(auth).send({});
    expect(res.status).toBe(400);
  });
});

describe('ownership checks (INV-4)', () => {
  it('returns 404 for another user project', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'someone-else' });
    const res = await request(app).get('/api/projects/p1').set(auth);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a missing project', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/projects/p1').set(auth);
    expect(res.status).toBe(404);
  });

  it('returns 404 when updating another user project', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'someone-else' });
    const res = await request(app).patch('/api/projects/p1').set(auth).send({ name: 'X' });
    expect(res.status).toBe(404);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('returns 404 when adding files to another user project', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'someone-else' });
    const res = await request(app)
      .post('/api/projects/p1/files')
      .set(auth)
      .send([{ filename: 'a.js', content: 'x' }]);
    expect(res.status).toBe(404);
    expect(prisma.projectFile.upsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/:id/files', () => {
  beforeEach(() => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'user-1' });
    prisma.projectFile.upsert.mockImplementation(async ({ create }) => create);
  });

  it('upserts with sha256 hash, detected language and line count', async () => {
    const content = 'const a = 1;\nconst b = 2;';
    const res = await request(app)
      .post('/api/projects/p1/files')
      .set(auth)
      .send([{ filename: 'src/a.js', content }]);

    expect(res.status).toBe(201);
    const expectedHash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    expect(prisma.projectFile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_filename: { projectId: 'p1', filename: 'src/a.js' } },
        create: expect.objectContaining({
          contentHash: expectedHash,
          language: 'javascript',
          lineCount: 2,
        }),
        update: expect.objectContaining({ contentHash: expectedHash }),
      })
    );
  });

  it('detects python and leaves unknown extensions null', async () => {
    await request(app)
      .post('/api/projects/p1/files')
      .set(auth)
      .send([
        { filename: 'main.py', content: 'print(1)' },
        { filename: 'notes.txt', content: 'hello' },
      ]);
    const langs = prisma.projectFile.upsert.mock.calls.map((c) => c[0].create.language);
    expect(langs).toEqual(['python', null]);
  });

  it('rejects malformed bodies', async () => {
    const res = await request(app)
      .post('/api/projects/p1/files')
      .set(auth)
      .send([{ filename: 'a.js' }]);
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/projects/:id/files/:fileId', () => {
  it('recomputes hash and line count on replace', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'user-1' });
    prisma.projectFile.findUnique.mockResolvedValue({ id: 'f1', projectId: 'p1' });
    prisma.projectFile.update.mockImplementation(async ({ data }) => ({ id: 'f1', ...data }));

    const content = 'line1\nline2\nline3';
    const res = await request(app)
      .put('/api/projects/p1/files/f1')
      .set(auth)
      .send({ content });

    expect(res.status).toBe(200);
    const expectedHash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    expect(prisma.projectFile.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { content, contentHash: expectedHash, lineCount: 3 },
    });
  });

  it('404s for a file belonging to a different project', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'user-1' });
    prisma.projectFile.findUnique.mockResolvedValue({ id: 'f1', projectId: 'other-project' });
    const res = await request(app)
      .put('/api/projects/p1/files/f1')
      .set(auth)
      .send({ content: 'x' });
    expect(res.status).toBe(404);
  });
});
