// Markdown summary of a completed audit for the audit-on-PR GitHub Action.
function formatPrComment(audit, issues = []) {
  const lines = [
    `## CodeLens Audit — Score: ${audit.overallScore}/100`,
    `Security ${audit.securityScore} · Performance ${audit.performanceScore} · Maintainability ${audit.maintainabilityScore} · Debt ${audit.debtScore} · Complexity ${audit.complexityScore}`,
    `Issues: ${audit.totalIssues} (${audit.criticalCount} critical) · Analyzed ${audit.analyzedFileCount} files, reused ${audit.reusedFileCount}`,
  ];
  const top = issues
    .filter((i) => i.severity === 'critical' || i.severity === 'high')
    .slice(0, 10);
  if (top.length > 0) {
    lines.push(
      ['| Severity | Category | File | Issue |', '|---|---|---|---|']
        .concat(
          top.map(
            (i) =>
              `| ${i.severity} | ${i.category} | ${i.file?.filename || '—'} | ${i.title} |`
          )
        )
        .join('\n')
    );
  }
  return lines.join('\n\n');
}

module.exports = { formatPrComment };
