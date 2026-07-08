// Scoring for the LLM evaluation harness (server/eval). A golden label is
// "found" when a finding matches on category AND either a keyword hit in the
// finding's title/description or a line number within ±3 — the standard fuzzy
// matching used for LLM-generated findings, where exact wording varies run to
// run but category + location are stable.
const LINE_TOLERANCE = 3;

function matchFinding(finding, label) {
  if (finding.category !== label.category) return false;
  const text = `${finding.title || ''} ${finding.description || ''}`.toLowerCase();
  const keywordHit = (label.keywords || []).some((k) => text.includes(k.toLowerCase()));
  const lineHit =
    label.line != null &&
    finding.line_number != null &&
    Math.abs(finding.line_number - label.line) <= LINE_TOLERANCE;
  return keywordHit || lineHit;
}

// One golden case: which labels were found, which findings matched nothing.
function scoreCase(findings, labels) {
  const matchedLabels = new Set();
  const matchedFindings = new Set();
  labels.forEach((label, li) => {
    findings.forEach((finding, fi) => {
      if (matchFinding(finding, label)) {
        matchedLabels.add(li);
        matchedFindings.add(fi);
      }
    });
  });
  return {
    labelsTotal: labels.length,
    labelsFound: matchedLabels.size,
    findingsTotal: findings.length,
    findingsMatched: matchedFindings.size,
    missedLabels: labels.filter((_, i) => !matchedLabels.has(i)),
    unmatchedFindings: findings.filter((_, i) => !matchedFindings.has(i)),
  };
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 1000) / 10;
}

// Aggregate case scores into overall + per-category precision/recall/F1.
// Recall is measured over labels; precision over findings.
function aggregate(caseResults) {
  const overall = { labelsTotal: 0, labelsFound: 0, findingsTotal: 0, findingsMatched: 0 };
  const byCategory = {};
  for (const result of caseResults) {
    overall.labelsTotal += result.score.labelsTotal;
    overall.labelsFound += result.score.labelsFound;
    overall.findingsTotal += result.score.findingsTotal;
    overall.findingsMatched += result.score.findingsMatched;
    for (const label of result.labels) {
      const cat = (byCategory[label.category] ||= { labelsTotal: 0, labelsFound: 0 });
      cat.labelsTotal += 1;
    }
    for (const label of result.labels) {
      const found = !result.score.missedLabels.includes(label);
      if (found) byCategory[label.category].labelsFound += 1;
    }
  }
  const summary = {
    recallPct: rate(overall.labelsFound, overall.labelsTotal),
    precisionPct: rate(overall.findingsMatched, overall.findingsTotal),
    ...overall,
  };
  if (summary.recallPct != null && summary.precisionPct != null && summary.recallPct + summary.precisionPct > 0) {
    summary.f1Pct =
      Math.round(
        ((2 * summary.precisionPct * summary.recallPct) /
          (summary.precisionPct + summary.recallPct)) *
          10
      ) / 10;
  } else {
    summary.f1Pct = null;
  }
  const categories = {};
  for (const [cat, c] of Object.entries(byCategory)) {
    categories[cat] = { ...c, recallPct: rate(c.labelsFound, c.labelsTotal) };
  }
  return { summary, categories };
}

module.exports = { matchFinding, scoreCase, aggregate, LINE_TOLERANCE };
