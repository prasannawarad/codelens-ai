process.env.JWT_SECRET = 'test-secret';

const { encryptSecret, decryptSecret } = require('../lib/secretBox');
const { diffAudits } = require('../services/auditDiff');

describe('secretBox (PAT encryption at rest)', () => {
  it('round-trips a secret', () => {
    const stored = encryptSecret('ghp_supersecrettoken123');
    expect(stored).toMatch(/^v1\./);
    expect(stored).not.toContain('ghp_supersecrettoken123');
    expect(decryptSecret(stored)).toBe('ghp_supersecrettoken123');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('reads legacy plaintext values unchanged', () => {
    expect(decryptSecret('ghp_plaintext')).toBe('ghp_plaintext');
  });

  it('returns null for null/empty and for tampered ciphertext', () => {
    expect(decryptSecret(null)).toBeNull();
    const stored = encryptSecret('token');
    const tampered = stored.slice(0, -4) + 'AAAA';
    expect(decryptSecret(tampered)).toBeNull();
  });

  it('returns null when the key changed (rotated JWT_SECRET)', () => {
    const stored = encryptSecret('token');
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'rotated-secret';
    expect(decryptSecret(stored)).toBeNull();
    process.env.JWT_SECRET = original;
  });
});

describe('diffAudits', () => {
  const issue = (filename, category, title, resolved = false) => ({
    category,
    title,
    resolved,
    file: filename ? { filename } : null,
  });

  const previous = {
    id: 'prev',
    completedAt: '2026-07-01T00:00:00Z',
    overallScore: 70,
    securityScore: 60,
    performanceScore: 80,
    maintainabilityScore: 75,
    debtScore: 65,
    complexityScore: 90,
    issues: [
      issue('a.js', 'security', 'Use of eval()'),
      issue('a.js', 'style', 'Debug output left in code'),
      issue('b.js', 'debt', 'Unresolved TODO', true), // resolved — not "fixed"
    ],
  };

  const current = {
    id: 'cur',
    overallScore: 82,
    securityScore: 85,
    performanceScore: 78,
    maintainabilityScore: 80,
    debtScore: 70,
    complexityScore: 90,
    issues: [
      issue('a.js', 'style', 'Debug output left in code'), // persists
      issue('c.js', 'bug', 'Null dereference'), // new
    ],
  };

  it('computes score deltas', () => {
    const diff = diffAudits(current, previous);
    expect(diff.scoreDeltas.overallScore).toBe(12);
    expect(diff.scoreDeltas.securityScore).toBe(25);
    expect(diff.scoreDeltas.performanceScore).toBe(-2);
    expect(diff.scoreDeltas.complexityScore).toBe(0);
  });

  it('identifies new and fixed issues, ignoring already-resolved ones', () => {
    const diff = diffAudits(current, previous);
    expect(diff.newCount).toBe(1);
    expect(diff.newIssues[0].title).toBe('Null dereference');
    expect(diff.fixedCount).toBe(1);
    expect(diff.fixedIssues[0].title).toBe('Use of eval()');
  });

  it('returns null with no previous audit', () => {
    expect(diffAudits(current, null)).toBeNull();
  });

  it('handles null scores gracefully', () => {
    const diff = diffAudits({ ...current, debtScore: null }, previous);
    expect(diff.scoreDeltas.debtScore).toBeNull();
  });
});
