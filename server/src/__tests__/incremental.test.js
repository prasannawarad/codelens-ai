const { partitionFiles, carryForwardIssues } = require('../services/incremental');

describe('partitionFiles', () => {
  const prevPerFile = [
    { filename: 'a.js', contentHash: 'hash-a' },
    { filename: 'b.js', contentHash: 'hash-b' },
    { filename: 'deleted.js', contentHash: 'hash-gone' },
  ];

  it('separates changed, new and unchanged files', () => {
    const current = [
      { filename: 'a.js', contentHash: 'hash-a' }, // unchanged
      { filename: 'b.js', contentHash: 'hash-b2' }, // modified
      { filename: 'c.js', contentHash: 'hash-c' }, // new
    ];
    const { changed, unchanged } = partitionFiles(current, prevPerFile);
    expect(unchanged.map((f) => f.filename)).toEqual(['a.js']);
    expect(changed.map((f) => f.filename)).toEqual(['b.js', 'c.js']);
  });

  it('treats everything as changed with no previous snapshot', () => {
    const current = [{ filename: 'a.js', contentHash: 'hash-a' }];
    expect(partitionFiles(current, null).changed).toHaveLength(1);
    expect(partitionFiles(current, []).changed).toHaveLength(1);
  });

  it('reports all unchanged when nothing was touched', () => {
    const current = [
      { filename: 'a.js', contentHash: 'hash-a' },
      { filename: 'b.js', contentHash: 'hash-b' },
    ];
    const { changed, unchanged } = partitionFiles(current, prevPerFile);
    expect(changed).toHaveLength(0);
    expect(unchanged).toHaveLength(2);
  });

  it('ignores snapshot entries without hashes (defensive)', () => {
    const current = [{ filename: 'a.js', contentHash: 'hash-a' }];
    const { changed } = partitionFiles(current, [{ filename: 'a.js' }]);
    expect(changed).toHaveLength(1);
  });
});

describe('carryForwardIssues', () => {
  const prevIssues = [
    {
      resolved: false,
      file: { filename: 'a.js' },
      category: 'security',
      severity: 'high',
      title: 'Hardcoded secret',
      description: 'desc',
      suggestion: 'fix it',
      lineNumber: 3,
    },
    {
      resolved: true, // resolved — must not carry
      file: { filename: 'a.js' },
      category: 'style',
      severity: 'low',
      title: 'Resolved issue',
      description: 'desc',
      suggestion: null,
      lineNumber: 1,
    },
    {
      resolved: false, // belongs to a changed file — must not carry
      file: { filename: 'changed.js' },
      category: 'bug',
      severity: 'medium',
      title: 'Changed-file issue',
      description: 'desc',
      suggestion: null,
      lineNumber: 9,
    },
    {
      resolved: false, // no file linkage — must not carry
      file: null,
      category: 'debt',
      severity: 'low',
      title: 'Project-level issue',
      description: 'desc',
      suggestion: null,
      lineNumber: null,
    },
  ];

  it('copies only unresolved issues on unchanged files', () => {
    const carried = carryForwardIssues(prevIssues, ['a.js']);
    expect(carried).toHaveLength(1);
    expect(carried[0]).toEqual({
      filename: 'a.js',
      category: 'security',
      severity: 'high',
      title: 'Hardcoded secret',
      description: 'desc',
      suggestion: 'fix it',
      line_number: 3,
    });
  });

  it('returns nothing when no files are unchanged', () => {
    expect(carryForwardIssues(prevIssues, [])).toEqual([]);
  });

  it('handles empty inputs', () => {
    expect(carryForwardIssues([], ['a.js'])).toEqual([]);
    expect(carryForwardIssues(null, ['a.js'])).toEqual([]);
  });
});

describe('worker incremental flow', () => {
  jest.mock('../lib/prisma', () => ({
    audit: { update: jest.fn(), findFirst: jest.fn() },
    projectFile: { findMany: jest.fn() },
    project: { update: jest.fn() },
    $transaction: jest.fn(),
  }));
  jest.mock('../lib/queue', () => ({ auditQueue: { add: jest.fn() }, connection: {} }));
  jest.mock('../services/gemini', () => ({ runGeminiAudit: jest.fn() }));

  const prisma = require('../lib/prisma');
  const { runGeminiAudit } = require('../services/gemini');
  const { processAudit } = require('../worker');
  const { analyzeStaticMetrics } = require('../services/staticMetrics');

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        issue: { createMany: jest.fn() },
        audit: { update: jest.fn() },
        project: { update: jest.fn() },
      })
    );
  });

  it('skips the AI path entirely when every file is unchanged', async () => {
    const content = 'const a = 1;';
    const files = [
      { id: 'f1', filename: 'a.js', language: 'javascript', content, contentHash: 'hash-a' },
    ];
    prisma.projectFile.findMany.mockResolvedValue(files);
    // Previous snapshot built the same way the worker builds it, so hashes match.
    const prevStatic = analyzeStaticMetrics(files);
    prisma.audit.findFirst.mockResolvedValue({
      id: 'prev',
      securityScore: 91,
      performanceScore: 82,
      maintainabilityScore: 73,
      debtScore: 64,
      summary: 'prev summary',
      staticMetrics: prevStatic,
      issues: [],
    });

    await processAudit({ data: { auditId: 'a2', projectId: 'p1', incremental: true } });

    expect(runGeminiAudit).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('analyzes only changed files when some differ', async () => {
    prisma.projectFile.findMany.mockResolvedValue([
      { id: 'f1', filename: 'a.js', language: 'javascript', content: 'const a = 1;', contentHash: 'hash-a' },
      { id: 'f2', filename: 'b.js', language: 'javascript', content: 'const b = 2;', contentHash: 'hash-b-NEW' },
    ]);
    prisma.audit.findFirst.mockResolvedValue({
      id: 'prev',
      securityScore: 90,
      performanceScore: 90,
      maintainabilityScore: 90,
      debtScore: 90,
      summary: 'prev',
      staticMetrics: {
        perFile: [
          { filename: 'a.js', contentHash: 'hash-a' },
          { filename: 'b.js', contentHash: 'hash-b-OLD' },
        ],
      },
      issues: [],
    });
    runGeminiAudit.mockResolvedValue({
      scores: { security: 80, performance: 80, maintainability: 80, debt: 80 },
      issues: [],
      summary: 'ok',
    });

    await processAudit({ data: { auditId: 'a2', projectId: 'p1', incremental: true } });

    expect(runGeminiAudit).toHaveBeenCalledTimes(1);
    expect(runGeminiAudit.mock.calls[0][0].map((f) => f.filename)).toEqual(['b.js']);
  });

  it('runs a full audit when incremental is false', async () => {
    prisma.projectFile.findMany.mockResolvedValue([
      { id: 'f1', filename: 'a.js', language: 'javascript', content: 'x', contentHash: 'h1' },
      { id: 'f2', filename: 'b.js', language: 'javascript', content: 'y', contentHash: 'h2' },
    ]);
    runGeminiAudit.mockResolvedValue({
      scores: { security: 80, performance: 80, maintainability: 80, debt: 80 },
      issues: [],
      summary: 'ok',
    });

    await processAudit({ data: { auditId: 'a1', projectId: 'p1', incremental: false } });

    expect(prisma.audit.findFirst).not.toHaveBeenCalled();
    expect(runGeminiAudit.mock.calls[0][0]).toHaveLength(2);
  });

  it('marks the audit failed and rethrows on error', async () => {
    prisma.projectFile.findMany.mockResolvedValue([]);
    await expect(
      processAudit({ data: { auditId: 'a1', projectId: 'p1', incremental: false } })
    ).rejects.toThrow(/no files/);
    expect(prisma.audit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({ status: 'failed' }),
      })
    );
  });
});
