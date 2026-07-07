const { calculateOverallScore, WEIGHTS } = require('../services/scoring');

describe('calculateOverallScore (INV-1)', () => {
  it('weights sum to exactly 1.0', () => {
    const sum =
      WEIGHTS.security +
      WEIGHTS.performance +
      WEIGHTS.maintainability +
      WEIGHTS.debt +
      WEIGHTS.complexity;
    expect(sum).toBe(1.0);
  });

  it('all-100 inputs produce exactly 100', () => {
    const score = calculateOverallScore(
      { security: 100, performance: 100, maintainability: 100, debt: 100 },
      100
    );
    expect(score).toBe(100);
  });

  it('all-zero inputs produce exactly 0', () => {
    const score = calculateOverallScore(
      { security: 0, performance: 0, maintainability: 0, debt: 0 },
      0
    );
    expect(score).toBe(0);
  });

  it('never exceeds 100 even with out-of-range inputs', () => {
    const score = calculateOverallScore(
      { security: 150, performance: 150, maintainability: 150, debt: 150 },
      150
    );
    expect(score).toBe(100);
  });

  it('never goes below 0 with negative inputs', () => {
    const score = calculateOverallScore(
      { security: -50, performance: -50, maintainability: -50, debt: -50 },
      -50
    );
    expect(score).toBe(0);
  });

  it('computes the documented weighted formula', () => {
    // 80*.25 + 60*.20 + 70*.20 + 50*.15 + 90*.20 = 20+12+14+7.5+18 = 71.5 → 72
    const score = calculateOverallScore(
      { security: 80, performance: 60, maintainability: 70, debt: 50 },
      90
    );
    expect(score).toBe(72);
  });
});
