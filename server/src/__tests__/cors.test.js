process.env.JWT_SECRET = 'test-secret';
// Read at module load in ../index, so it has to be set before the require below.
process.env.CORS_ORIGIN = 'https://prod.example.com, https://preview.example.com';

jest.mock('../lib/prisma', () => ({
  user: { findUnique: jest.fn(), create: jest.fn() },
}));

jest.mock('../lib/queue', () => ({
  auditQueue: { add: jest.fn() },
  connection: {},
}));

const request = require('supertest');
const app = require('../index');

const preflight = (origin) =>
  request(app)
    .options('/api/auth/register')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST');

describe('CORS_ORIGIN as a comma-separated list', () => {
  it('allows the first origin', async () => {
    const res = await preflight('https://prod.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://prod.example.com');
  });

  it('allows a later origin, tolerating whitespace around the comma', async () => {
    const res = await preflight('https://preview.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://preview.example.com');
  });

  it('does not allow an origin outside the list', async () => {
    const res = await preflight('https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
