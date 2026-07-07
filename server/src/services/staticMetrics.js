// Deterministic static metrics — zero AI, fully unit-testable.
// All metrics are token/line-window approximations (documented in the README):
// complexity counts decision-point tokens, function length uses brace/indent
// tracking, duplication hashes sliding 6-line windows.
const crypto = require('crypto');

const COMMENT_PREFIXES = ['//', '#', '/*', '*', '*/', '--'];

// Decision-point tokens: if (covers `else if`), for, while, case, catch,
// &&, ||, ternary `?` (excluding `?.` and `??`).
const DECISION_PATTERNS = [
  /\bif\b/g,
  /\bfor\b/g,
  /\bwhile\b/g,
  /\bcase\b/g,
  /\bcatch\b/g,
  /&&/g,
  /\|\|/g,
  /(?<![?.])\?(?![.?])/g,
];

const WINDOW_SIZE = 6;

function round1(x) {
  return Math.round(x * 10) / 10;
}

// Non-empty, non-comment lines.
function codeLines(content) {
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !COMMENT_PREFIXES.some((p) => l.startsWith(p)));
}

// 1 + count of decision-point tokens.
function approxComplexity(lines) {
  const src = lines.join('\n');
  return 1 + DECISION_PATTERNS.reduce((n, re) => n + (src.match(re) || []).length, 0);
}

// Longest span from a function declaration token to its closing scope.
// Brace-depth tracking for `function`/`=> {`, indent tracking for `def `.
function maxFunctionLength(rawLines) {
  let max = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (/\bfunction\b|=>\s*\{/.test(line)) {
      let depth = 0;
      let started = false;
      for (let j = i; j < rawLines.length; j++) {
        for (const ch of rawLines[j]) {
          if (ch === '{') {
            depth++;
            started = true;
          } else if (ch === '}') {
            depth--;
          }
        }
        if (started && depth <= 0) {
          max = Math.max(max, j - i + 1);
          break;
        }
        if (j === rawLines.length - 1) max = Math.max(max, j - i + 1);
      }
    } else if (/^\s*def\s/.test(line)) {
      const indent = line.match(/^\s*/)[0].length;
      let j = i + 1;
      while (j < rawLines.length) {
        const l = rawLines[j];
        if (l.trim().length > 0 && l.match(/^\s*/)[0].length <= indent) break;
        j++;
      }
      max = Math.max(max, j - i);
    }
  }
  return max;
}

// Normalize (trim, collapse whitespace, drop empties) then hash sliding
// 6-line windows.
function windowHashes(content) {
  const lines = content
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter((l) => l.length > 0);
  const hashes = [];
  for (let i = 0; i + WINDOW_SIZE <= lines.length; i++) {
    hashes.push(
      crypto.createHash('sha1').update(lines.slice(i, i + WINDOW_SIZE).join('\n')).digest('hex')
    );
  }
  return hashes;
}

// duplicated windows = occurrences beyond the first of each distinct window.
function duplicationPct(hashes) {
  if (hashes.length === 0) return 0;
  const seen = new Set();
  let dup = 0;
  for (const h of hashes) {
    if (seen.has(h)) dup++;
    else seen.add(h);
  }
  return (dup / hashes.length) * 100;
}

// complexityScore: 0-100, higher = better.
// avgComplexityPerFile <= 10 → 100; each point above 10 costs 4; floor 0.
// Then subtract duplicationPct * 0.5, floor 0.
function complexityToScore(avgComplexity, duplicationPercent) {
  const base = Math.max(0, 100 - Math.max(0, avgComplexity - 10) * 4);
  return Math.max(0, Math.round(base - duplicationPercent * 0.5));
}

// files: [{ filename, content, contentHash? }]. When contentHash is present it
// is stored in the perFile entry — the incremental diff (§7) depends on it.
function analyzeStaticMetrics(files) {
  const perFile = [];
  const pooledHashes = [];
  for (const f of files) {
    const code = codeLines(f.content);
    const hashes = windowHashes(f.content);
    pooledHashes.push(...hashes);
    perFile.push({
      filename: f.filename,
      ...(f.contentHash ? { contentHash: f.contentHash } : {}),
      loc: code.length,
      complexity: approxComplexity(code),
      maxFunctionLength: maxFunctionLength(f.content.split('\n')),
      duplicationPct: round1(duplicationPct(hashes)),
    });
  }
  const loc = perFile.reduce((s, f) => s + f.loc, 0);
  const avgComplexity = perFile.length
    ? perFile.reduce((s, f) => s + f.complexity, 0) / perFile.length
    : 0;
  // Pooled across files so cross-file copy-paste counts as duplication.
  const totalDuplicationPct = round1(duplicationPct(pooledHashes));
  return {
    perFile,
    totals: { loc, avgComplexity: round1(avgComplexity), duplicationPct: totalDuplicationPct },
    complexityScore: complexityToScore(avgComplexity, totalDuplicationPct),
  };
}

module.exports = { analyzeStaticMetrics, complexityToScore };
