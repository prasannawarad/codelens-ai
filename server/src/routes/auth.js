const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password and name are required' });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, passwordHash, name } });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// Settings endpoints (auth-protected per INV-4). The GitHub PAT is stored for
// private-repo imports and never echoed back — only its presence.
const authMiddleware = require('../middleware/auth');

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, githubToken: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { githubToken, ...rest } = user;
    res.json({ ...rest, hasGithubToken: Boolean(githubToken) });
  } catch (err) {
    next(err);
  }
});

router.patch('/me', authMiddleware, async (req, res, next) => {
  try {
    const { name, githubToken } = req.body || {};
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(typeof name === 'string' && name ? { name } : {}),
        // empty string clears the stored PAT
        ...(typeof githubToken === 'string' ? { githubToken: githubToken || null } : {}),
      },
      select: { id: true, email: true, name: true, githubToken: true },
    });
    const { githubToken: token, ...rest } = user;
    res.json({ ...rest, hasGithubToken: Boolean(token) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
