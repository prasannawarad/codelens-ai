// Gemini audit service. Frozen signature — the worker depends on it:
//   runGeminiAudit(files) -> { scores, issues, summary }
// files: [{ filename, language, content }]
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Batch when concatenated code exceeds ~80K characters (§6.2).
const CHUNK_CHAR_LIMIT = 80_000;
const SCORE_KEYS = ['security', 'performance', 'maintainability', 'debt'];

let genAI = null;
function getModel() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  });
}

function buildPrompt(files) {
  return `You are CodeLens, a senior staff engineer performing a comprehensive code audit.
Analyze this codebase thoroughly.

Codebase:
${files.map((f) => `--- ${f.filename} (${f.language}) ---\n${f.content}`).join('\n\n')}

Perform a deep audit across 5 categories:
1. BUGS: Logic errors, null references, race conditions, edge cases
2. SECURITY: Injection, XSS, auth issues, data exposure, hardcoded secrets
3. PERFORMANCE: N+1 queries, memory leaks, unnecessary re-renders, O(n^2)
4. STYLE: Naming conventions, code duplication, dead code, complexity
5. DEBT: Missing error handling, no tests, tight coupling, missing types

Respond ONLY in valid JSON:
{
  "summary": "2-3 sentence overall assessment",
  "scores": {
    "security": (0-100), "performance": (0-100),
    "maintainability": (0-100), "debt": (0-100, lower=more debt)
  },
  "issues": [
    {
      "filename": "exact filename",
      "category": "bug|security|performance|style|debt",
      "severity": "critical|high|medium|low",
      "title": "Short issue title",
      "description": "What's wrong and why it matters",
      "suggestion": "Specific code fix or improvement",
      "line_number": (approximate line or null)
    }
  ]
}`;
}

function stripFences(text) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
}

function clamp(n) {
  return Math.min(100, Math.max(0, Number(n)));
}

// Parse + validate one model response. Throws on unusable shape.
function parseAuditResponse(raw) {
  const parsed = JSON.parse(stripFences(raw));
  if (!parsed || typeof parsed !== 'object') throw new Error('Response is not an object');
  const scores = parsed.scores;
  if (!scores || typeof scores !== 'object') throw new Error('Missing scores object');
  const clamped = {};
  for (const key of SCORE_KEYS) {
    if (typeof scores[key] !== 'number' || Number.isNaN(scores[key])) {
      throw new Error(`Score "${key}" missing or not numeric`);
    }
    clamped[key] = clamp(scores[key]);
  }
  if (!Array.isArray(parsed.issues)) throw new Error('issues is not an array');
  const issues = parsed.issues
    .filter((i) => i && typeof i === 'object' && i.title)
    .map((i) => ({
      filename: typeof i.filename === 'string' ? i.filename : null,
      category: typeof i.category === 'string' ? i.category : 'debt',
      severity: typeof i.severity === 'string' ? i.severity : 'medium',
      title: String(i.title),
      description: typeof i.description === 'string' ? i.description : '',
      suggestion: typeof i.suggestion === 'string' ? i.suggestion : null,
      line_number: Number.isInteger(i.line_number) ? i.line_number : null,
    }));
  return {
    scores: clamped,
    issues,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  };
}

async function generate(prompt) {
  const result = await getModel().generateContent(prompt);
  return result.response.text();
}

// One model call with parse-failure hardening: retry once demanding pure
// JSON, then throw carrying the raw response for Audit.errorMessage.
async function auditBatch(files) {
  const prompt = buildPrompt(files);
  const first = await generate(prompt);
  try {
    return parseAuditResponse(first);
  } catch {
    const second = await generate(`${prompt}\n\nReturn ONLY the JSON object.`);
    try {
      return parseAuditResponse(second);
    } catch (err) {
      const error = new Error(
        `Gemini returned unparseable JSON after retry (${err.message}). Raw response: ${second.slice(0, 1500)}`
      );
      error.rawResponse = second;
      throw error;
    }
  }
}

// Greedy batching under the char limit; an oversized single file gets its own
// batch rather than being split.
function chunkFiles(files, limit = CHUNK_CHAR_LIMIT) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const file of files) {
    const fileSize = file.content.length;
    if (current.length > 0 && size + fileSize > limit) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += fileSize;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

// Merge per-batch results: concat issues, average scores weighted by batch LOC.
function mergeBatchResults(results, batches) {
  const weights = batches.map(
    (batch) => batch.reduce((sum, f) => sum + f.content.split('\n').length, 0) || 1
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const scores = {};
  for (const key of SCORE_KEYS) {
    scores[key] = Math.round(
      results.reduce((sum, r, i) => sum + r.scores[key] * weights[i], 0) / totalWeight
    );
  }
  return {
    scores,
    issues: results.flatMap((r) => r.issues),
    summary: results.map((r) => r.summary).filter(Boolean).join(' '),
  };
}

async function runGeminiAudit(files) {
  if (!files || files.length === 0) {
    return {
      scores: { security: 100, performance: 100, maintainability: 100, debt: 100 },
      issues: [],
      summary: 'No changed files to analyze.',
    };
  }
  const batches = chunkFiles(files);
  if (batches.length === 1) return auditBatch(batches[0]);
  const results = [];
  for (const batch of batches) results.push(await auditBatch(batch));
  return mergeBatchResults(results, batches);
}

module.exports = {
  runGeminiAudit,
  // exported for unit tests
  stripFences,
  parseAuditResponse,
  chunkFiles,
  mergeBatchResults,
  CHUNK_CHAR_LIMIT,
};
