process.env.JWT_SECRET = 'test-secret';

jest.mock('../lib/prisma', () => ({
  user: { findUnique: jest.fn(), create: jest.fn() },
}));

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');
const app = require('../index');

beforeEach(() => jest.clearAllMocks());

describe('POST /api/auth/register', () => {
  it('creates a user and returns 201 with a token', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }) => ({
      id: 'u1',
      ...data,
    }));

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'hunter22', name: 'Ada' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toEqual({ id: 'u1', email: 'a@b.com', name: 'Ada' });
    expect(res.body.user.passwordHash).toBeUndefined();
    const payload = jwt.verify(res.body.token, 'test-secret');
    expect(payload.id).toBe('u1');
  });

  it('rejects duplicate emails with 409', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'hunter22', name: 'Ada' });
    expect(res.status).toBe(409);
  });

  it('rejects missing fields with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token for valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'Ada',
      passwordHash: await bcrypt.hash('hunter22', 10),
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'hunter22' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('returns 401 for a wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'Ada',
      passwordHash: await bcrypt.hash('hunter22', 10),
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for an unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@b.com', password: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('authMiddleware (INV-4)', () => {
  const protectedApp = express();
  protectedApp.get('/protected', authMiddleware, (req, res) => res.json({ user: req.user }));

  it('rejects requests without a token', async () => {
    const res = await request(protectedApp).get('/protected');
    expect(res.status).toBe(401);
  });

  it('rejects garbage tokens', async () => {
    const res = await request(protectedApp)
      .get('/protected')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('attaches req.user for a valid token', async () => {
    const token = jwt.sign({ id: 'u1', email: 'a@b.com' }, 'test-secret');
    const res = await request(protectedApp)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 'u1', email: 'a@b.com' });
  });
});

describe('GET /health', () => {
  it('responds 200 without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
