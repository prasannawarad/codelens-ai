const { analyzeStaticMetrics, complexityToScore } = require('../services/staticMetrics');

const JS_FIXTURE = `// adds two numbers
function add(a, b) {
  if (a > 0 && b > 0) {
    return a + b;
  }
  return a - b;
}`;

describe('analyzeStaticMetrics', () => {
  it('computes LOC excluding blank and comment lines', () => {
    const { perFile } = analyzeStaticMetrics([{ filename: 'a.js', content: JS_FIXTURE }]);
    expect(perFile[0].loc).toBe(6); // 7 lines minus the comment
  });

  it('computes approximate cyclomatic complexity (1 + decision points)', () => {
    const { perFile } = analyzeStaticMetrics([{ filename: 'a.js', content: JS_FIXTURE }]);
    expect(perFile[0].complexity).toBe(3); // 1 + if + &&
  });

  it('counts ternaries but not optional chaining or nullish coalescing', () => {
    const content = 'const a = x ? 1 : 2;\nconst b = obj?.prop;\nconst c = y ?? 3;';
    const { perFile } = analyzeStaticMetrics([{ filename: 'a.js', content }]);
    expect(perFile[0].complexity).toBe(2); // 1 + one real ternary
  });

  it('measures max function length via brace tracking', () => {
    const { perFile } = analyzeStaticMetrics([{ filename: 'a.js', content: JS_FIXTURE }]);
    expect(perFile[0].maxFunctionLength).toBe(6); // function line through closing brace
  });

  it('measures python def length via indentation', () => {
    const py = 'def f(x):\n    if x:\n        return 1\n    return 0\n\nprint(f(1))';
    const { perFile } = analyzeStaticMetrics([{ filename: 'a.py', content: py }]);
    expect(perFile[0].maxFunctionLength).toBe(5); // def + body + blank line before dedent
  });

  it('detects duplication via repeated 6-line windows', () => {
    const block = ['const a1 = 1;', 'const a2 = 2;', 'const a3 = 3;', 'const a4 = 4;', 'const a5 = 5;', 'const a6 = 6;'];
    const content = [...block, ...block].join('\n'); // 12 lines, block repeated
    const { perFile } = analyzeStaticMetrics([{ filename: 'dup.js', content }]);
    // 7 windows, 1 repeat → 1/7 ≈ 14.3%
    expect(perFile[0].duplicationPct).toBeCloseTo(14.3, 1);
  });

  it('reports 0 duplication for files shorter than one window', () => {
    const { perFile } = analyzeStaticMetrics([{ filename: 'tiny.js', content: 'const a = 1;' }]);
    expect(perFile[0].duplicationPct).toBe(0);
  });

  it('catches cross-file duplication in the pooled total', () => {
    const block = ['let x1 = 1;', 'let x2 = 2;', 'let x3 = 3;', 'let x4 = 4;', 'let x5 = 5;', 'let x6 = 6;'].join('\n');
    const { perFile, totals } = analyzeStaticMetrics([
      { filename: 'a.js', content: block },
      { filename: 'b.js', content: block },
    ]);
    expect(perFile[0].duplicationPct).toBe(0); // one window each, no repeat within a file
    expect(totals.duplicationPct).toBe(50); // 2 pooled windows, 1 repeat
  });

  it('carries contentHash into perFile entries when provided (incremental key)', () => {
    const { perFile } = analyzeStaticMetrics([
      { filename: 'a.js', content: 'const a = 1;', contentHash: 'abc123' },
    ]);
    expect(perFile[0].contentHash).toBe('abc123');
  });

  it('handles an empty file list', () => {
    const result = analyzeStaticMetrics([]);
    expect(result.totals).toEqual({ loc: 0, avgComplexity: 0, duplicationPct: 0 });
    expect(result.complexityScore).toBe(100);
  });
});

describe('complexityToScore', () => {
  it('gives 100 for avg complexity <= 10 and no duplication', () => {
    expect(complexityToScore(10, 0)).toBe(100);
    expect(complexityToScore(3, 0)).toBe(100);
  });

  it('costs 4 points per complexity point above 10', () => {
    expect(complexityToScore(20, 0)).toBe(60);
    expect(complexityToScore(35, 0)).toBe(0);
  });

  it('subtracts half the duplication percentage', () => {
    expect(complexityToScore(10, 20)).toBe(90);
  });

  it('floors at 0', () => {
    expect(complexityToScore(50, 100)).toBe(0);
  });
});
