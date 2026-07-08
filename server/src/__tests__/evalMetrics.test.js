const { matchFinding, scoreCase, aggregate } = require('../services/evalMetrics');

const finding = (category, title, line = null, description = '') => ({
  category,
  title,
  description,
  line_number: line,
});

describe('matchFinding', () => {
  const label = { category: 'security', keywords: ['eval', 'injection'], line: 5 };

  it('matches on category + keyword', () => {
    expect(matchFinding(finding('security', 'Use of eval() is dangerous'), label)).toBe(true);
  });

  it('matches keywords in the description too', () => {
    expect(
      matchFinding(finding('security', 'Dangerous call', null, 'allows code injection'), label)
    ).toBe(true);
  });

  it('matches on category + line within tolerance', () => {
    expect(matchFinding(finding('security', 'Unrelated wording', 7), label)).toBe(true);
    expect(matchFinding(finding('security', 'Unrelated wording', 9), label)).toBe(false);
  });

  it('never matches across categories', () => {
    expect(matchFinding(finding('style', 'Use of eval()', 5), label)).toBe(false);
  });
});

describe('scoreCase', () => {
  const labels = [
    { category: 'security', keywords: ['eval'], line: 3 },
    { category: 'bug', keywords: ['null'], line: 10 },
  ];

  it('counts found labels and unmatched findings', () => {
    const findings = [
      finding('security', 'eval() on user input', 3),
      finding('style', 'Poor naming', 1), // matches nothing → FP
    ];
    const score = scoreCase(findings, labels);
    expect(score.labelsFound).toBe(1);
    expect(score.labelsTotal).toBe(2);
    expect(score.findingsMatched).toBe(1);
    expect(score.findingsTotal).toBe(2);
    expect(score.missedLabels).toHaveLength(1);
    expect(score.missedLabels[0].category).toBe('bug');
    expect(score.unmatchedFindings).toHaveLength(1);
  });

  it('does not double-count one finding matching one label twice', () => {
    const findings = [finding('security', 'eval usage', 3)];
    const score = scoreCase(findings, labels);
    expect(score.labelsFound).toBe(1);
    expect(score.findingsMatched).toBe(1);
  });

  it('handles clean files (no labels): findings there are pure false positives', () => {
    const score = scoreCase([finding('debt', 'Invented problem')], []);
    expect(score.labelsTotal).toBe(0);
    expect(score.findingsMatched).toBe(0);
    expect(score.findingsTotal).toBe(1);
  });
});

describe('aggregate', () => {
  it('computes overall precision/recall/F1 and per-category recall', () => {
    const labels1 = [{ category: 'security', keywords: ['eval'], line: 3 }];
    const labels2 = [{ category: 'bug', keywords: ['null'], line: 2 }];
    const case1 = {
      labels: labels1,
      score: scoreCase([finding('security', 'eval() call', 3)], labels1),
    };
    const case2 = {
      labels: labels2,
      score: scoreCase([finding('style', 'nitpick', 9)], labels2), // miss + FP
    };
    const { summary, categories } = aggregate([case1, case2]);
    expect(summary.labelsTotal).toBe(2);
    expect(summary.labelsFound).toBe(1);
    expect(summary.recallPct).toBe(50);
    expect(summary.precisionPct).toBe(50); // 1 of 2 findings matched
    expect(summary.f1Pct).toBe(50);
    expect(categories.security.recallPct).toBe(100);
    expect(categories.bug.recallPct).toBe(0);
  });

  it('returns null rates when there is nothing to measure', () => {
    const { summary } = aggregate([]);
    expect(summary.recallPct).toBeNull();
    expect(summary.precisionPct).toBeNull();
    expect(summary.f1Pct).toBeNull();
  });
});
