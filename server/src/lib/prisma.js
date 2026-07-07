// Single shared PrismaClient instance. Every route and the worker import from
// here — never `new PrismaClient()` anywhere else.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
