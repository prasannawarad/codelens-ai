// INV-4: auth alone is not authorization. Project-scoped handlers verify
// project.userId === req.user.id. Missing OR foreign both return null so the
// caller responds 404 (not 403) to avoid resource enumeration.
const prisma = require('./prisma');

async function findOwnedProject(projectId, userId) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== userId) return null;
  return project;
}

module.exports = { findOwnedProject };
