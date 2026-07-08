// LLM evaluation harness: runs the audit engine against a labeled golden
// dataset and reports precision/recall/F1 overall and per category.
//
//   GEMINI_API_KEY=demo npm run eval          # deterministic heuristic engine
//   GEMINI_API_KEY=<key> npm run eval         # live Gemini
//   npm run eval -- --limit 5                 # token-frugal subset
//
// Results are printed and written to eval/results/<timestamp>-<engine>.json.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { runGeminiAudit } = require('../src/services/gemini');
const { detectLanguage } = require('../src/lib/lang');
const { scoreCase, aggregate } = require('../src/services/evalMetrics');

const manifest = require('./golden.json');

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const pct = (v) => (v == null ? '  n/a' : `${String(v).padStart(5)}%`);

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('Set GEMINI_API_KEY (use "demo" for the heuristic engine).');
    process.exit(1);
  }
  const engine =
    process.env.GEMINI_API_KEY === 'demo'
      ? 'demo-heuristics'
      : process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const cases = manifest.slice(0, limit);
  console.log(`CodeLens eval — engine: ${engine}, cases: ${cases.length}\n`);

  const results = [];
  for (const goldenCase of cases) {
    const content = fs.readFileSync(path.join(__dirname, 'golden', goldenCase.file), 'utf8');
    const { issues } = await runGeminiAudit([
      { filename: goldenCase.file, language: detectLanguage(goldenCase.file), content },
    ]);
    const score = scoreCase(issues, goldenCase.labels);
    results.push({ id: goldenCase.id, labels: goldenCase.labels, score });
    const status =
      goldenCase.labels.length === 0
        ? score.findingsTotal === 0
          ? 'clean, no findings'
          : `clean file, ${score.findingsTotal} false positive(s)`
        : `${score.labelsFound}/${score.labelsTotal} labels found, ${score.findingsTotal} finding(s)`;
    console.log(`  ${goldenCase.id.padEnd(16)} ${status}`);
  }

  const { summary, categories } = aggregate(results);
  console.log('\n  Overall');
  console.log(`    recall    ${pct(summary.recallPct)}  (${summary.labelsFound}/${summary.labelsTotal} labeled defects found)`);
  console.log(`    precision ${pct(summary.precisionPct)}  (${summary.findingsMatched}/${summary.findingsTotal} findings matched a label)`);
  console.log(`    F1        ${pct(summary.f1Pct)}`);
  console.log('\n  Recall by category');
  for (const [cat, c] of Object.entries(categories)) {
    console.log(`    ${cat.padEnd(12)} ${pct(c.recallPct)}  (${c.labelsFound}/${c.labelsTotal})`);
  }

  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${engine}.json`
  );
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        engine,
        ranAt: new Date().toISOString(),
        summary,
        categories,
        cases: results.map((r) => ({
          id: r.id,
          labelsFound: r.score.labelsFound,
          labelsTotal: r.score.labelsTotal,
          findingsTotal: r.score.findingsTotal,
          missed: r.score.missedLabels.map((l) => `${l.category}:${l.keywords[0]}`),
          falsePositives: r.score.unmatchedFindings.map((f) => `${f.category}:${f.title}`),
        })),
      },
      null,
      2
    )
  );
  console.log(`\n  Results written to ${path.relative(process.cwd(), outPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
