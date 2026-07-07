// Compare a completed audit against the previous completed one: score deltas
// plus new / fixed issues. Issues are matched by (filename, category, title) —
// line numbers shift too easily to key on.
const SCORE_FIELDS = [
  'overallScore',
  'securityScore',
  'performanceScore',
  'maintainabilityScore',
  'debtScore',
  'complexityScore',
];

function issueKey(issue) {
  return [issue.file?.filename || '', issue.category, issue.title].join('|');
}

// current/previous: Audit rows with issues[] (each including file.filename).
function diffAudits(current, previous) {
  if (!previous) return null;
  const scoreDeltas = {};
  for (const field of SCORE_FIELDS) {
    scoreDeltas[field] =
      current[field] != null && previous[field] != null
        ? Math.round(current[field] - previous[field])
        : null;
  }
  const prevKeys = new Set((previous.issues || []).map(issueKey));
  const curKeys = new Set((current.issues || []).map(issueKey));
  const newIssues = (current.issues || []).filter((i) => !prevKeys.has(issueKey(i)));
  // "Fixed" = was open in the previous audit and no longer reported.
  const fixedIssues = (previous.issues || []).filter(
    (i) => !i.resolved && !curKeys.has(issueKey(i))
  );
  return {
    previousAuditId: previous.id,
    previousCompletedAt: previous.completedAt,
    scoreDeltas,
    newCount: newIssues.length,
    fixedCount: fixedIssues.length,
    newIssues,
    fixedIssues,
  };
}

module.exports = { diffAudits, issueKey };
