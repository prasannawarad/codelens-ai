// INV-1: the one true scoring formula. Weights sum to exactly 1.0 and the
// result is clamped to [0, 100].
const WEIGHTS = {
  security: 0.25,
  performance: 0.2,
  maintainability: 0.2,
  debt: 0.15,
  complexity: 0.2,
};

// aiScores: {security, performance, maintainability, debt} each 0-100
// complexityScore: 0-100 from staticMetrics
function calculateOverallScore(aiScores, complexityScore) {
  const score = Math.round(
    aiScores.security * WEIGHTS.security +
      aiScores.performance * WEIGHTS.performance +
      aiScores.maintainability * WEIGHTS.maintainability +
      aiScores.debt * WEIGHTS.debt +
      complexityScore * WEIGHTS.complexity
  );
  return Math.min(100, Math.max(0, score));
}

module.exports = { calculateOverallScore, WEIGHTS };
