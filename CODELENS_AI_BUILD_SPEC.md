# CodeLens AI — Production Build Specification

**Author role:** Senior Software / AI Engineer, 10+ years in production systems
**Consumer:** Claude Code (autonomous agent). This document is the single source of truth. Do not improvise architecture. Where this spec conflicts with your instinct, the spec wins.

---

## 0. What we are building

CodeLens AI is a full-stack AI code audit and technical debt tracking platform. Not a paste-code-get-review toy — a persistent workspace where a user:

1. Creates projects and adds code (manual upload, paste, or **GitHub repo import**)
2. Runs audits that combine **deterministic static metrics** (complexity, LOC, duplication) with **LLM analysis** (Gemini) across bugs / security / performance / style / debt
3. Gets a weighted 0–100 score and an itemized, per-file issue list
4. Fixes issues, re-audits, and watches the **debt score trend over time**
5. Audits run **asynchronously** on a BullMQ/Redis job queue — never inline in the request cycle
6. Re-audits are **incremental**: only changed files (content-hash diff) are re-analyzed; unchanged results are reused
7. A **GitHub Action** can trigger an audit on PR and comment results back

Think SonarQube + LLM, free tier, deployed.

### Non-negotiable engineering invariants

These four items encode bugs found in a prior code-generation pass. Treat them as law:

- **INV-1 (Scoring):** Score weights MUST sum to exactly 1.0. The canonical formula is in §6.3. Never let a weighted score exceed 100.
- **INV-2 (Persistence):** The audit worker MUST persist Issue rows (`prisma.issue.createMany`) and update `project.debtScore` + `project.lastAuditAt` inside the same logical unit of work as the Audit row. An audit with an empty Issue table is a failed audit.
- **INV-3 (Redis):** The BullMQ IORedis connection MUST set `maxRetriesPerRequest: null` (BullMQ hard requirement) and `tls: { rejectUnauthorized: false }` when the URL is `rediss://` (Upstash).
- **INV-4 (Auth):** Every route except `/api/auth/register`, `/api/auth/login`, and `/health` MUST pass through `authMiddleware`. Additionally, every project-scoped handler MUST verify `project.userId === req.user.id` (ownership check) — auth alone is not authorization.

---

## 1. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 + Vite, Tailwind CSS v4 (`@tailwindcss/vite`), react-router-dom, axios, recharts, react-syntax-highlighter | Deployed on Vercel |
| Backend | Node 20, Express, Prisma ORM | Deployed on Railway |
| Database | PostgreSQL (Supabase free tier) | Connection string in `DATABASE_URL` |
| Queue | BullMQ + IORedis (Upstash free tier) | `REDIS_URL` (rediss://) |
| AI | Google Gemini API (`@google/generative-ai`), model `gemini-1.5-flash` default, configurable via `GEMINI_MODEL` | Strict JSON output contract (§6.2) |
| GitHub | Octokit REST (`@octokit/rest`) | Public repos with no token; private repos via optional user PAT |
| Static analysis | `escomplex`-style metrics implemented in-house (§6.1) — no heavyweight deps | Deterministic, testable |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` | 7-day expiry |
| Tests | Jest + Supertest (server), minimal | CI runs on push/PR |
| CI/CD | GitHub Actions | Test workflow + audit-on-PR workflow |

---

## 2. Repository layout

```
codelens-ai/
  client/                          # React + Vite (Vercel)
    src/
      pages/
        Login.jsx
        Register.jsx
        Dashboard.jsx              # project list + global stats
        ProjectView.jsx            # star page: files | code viewer | issues
        AuditReport.jsx            # full audit results
        DebtTimeline.jsx           # debt score over time (recharts)
        Settings.jsx
      components/
        FileUploader.jsx           # drag-drop + paste + GitHub URL
        GitHubImport.jsx           # repo import modal
        CodeViewer.jsx             # syntax highlighted
        IssueCard.jsx
        ScoreGauge.jsx             # circular SVG gauge
        DebtChart.jsx
        AuditProgress.jsx          # polls job status
        MetricsPanel.jsx           # static metrics display
      context/AuthContext.jsx
      api/client.js                # axios instance w/ JWT interceptor
    .env.example                   # VITE_API_URL
  server/                          # Express (Railway)
    prisma/schema.prisma
    src/
      index.js                     # express app; DOES NOT start worker
      worker.js                    # BullMQ worker entrypoint (separate process)
      lib/
        prisma.js                  # single shared PrismaClient instance
        queue.js                   # BullMQ queue + IORedis connection (INV-3)
      middleware/auth.js           # authMiddleware (INV-4)
      routes/
        auth.js
        projects.js
        files.js
        audits.js                  # enqueue + status + results
        github.js                  # repo import
      services/
        gemini.js                  # runGeminiAudit(files) -> {scores, issues, summary}
        staticMetrics.js           # deterministic metrics (§6.1)
        scoring.js                 # calculateOverallScore (§6.3, INV-1)
        githubImport.js            # Octokit fetch + filter
        incremental.js             # hash/diff logic (§7)
        prComment.js               # markdown summary for CI mode
      __tests__/
        auth.test.js
        projects.test.js
        scoring.test.js            # asserts weights sum to 1.0 and score <= 100
        staticMetrics.test.js
    .env.example
  .github/workflows/
    ci.yml                         # tests on push/PR
    codelens-audit.yml             # audit-on-PR (§9)
  README.md
```

**Import discipline:** exactly one `PrismaClient` instance, exported from `server/src/lib/prisma.js`. Every route and the worker import it from there. Never `new PrismaClient()` anywhere else, never `require('../prisma/client')`.

---

## 3. Environment variables

`server/.env.example`:

```
DATABASE_URL="postgresql://postgres:[pass]@[host]:5432/postgres"
JWT_SECRET="replace-with-64-char-random"
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-1.5-flash"
REDIS_URL="rediss://default:[pass]@[host].upstash.io:6379"
PORT=3001
CORS_ORIGIN="http://localhost:5173"
```

`client/.env.example`:

```
VITE_API_URL="http://localhost:3001"
```

Never hardcode secrets. Fail fast at boot with a clear message if a required env var is missing (small `assertEnv()` helper in `index.js` and `worker.js`).

---

## 4. Database schema (Prisma)

Extends the original 5-table design with fields for GitHub, incremental analysis, static metrics, and async job tracking. Use exactly this schema.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String    @map("password_hash")
  name         String
  githubToken  String?   @map("github_token")   // optional PAT for private repos
  createdAt    DateTime  @default(now())
  projects     Project[]
}

model Project {
  id          String    @id @default(uuid())
  userId      String    @map("user_id")
  user        User      @relation(fields: [userId], references: [id])
  name        String
  description String?
  language    String?                            // auto-detected primary language
  // GitHub linkage
  repoUrl     String?   @map("repo_url")         // e.g. https://github.com/owner/repo
  repoBranch  String?   @map("repo_branch")      // default "main"
  lastSyncSha String?   @map("last_sync_sha")    // HEAD commit at last import
  // Audit state
  lastAuditAt DateTime? @map("last_audit_at")
  debtScore   Float?    @map("debt_score")       // 0-100, lower = more debt
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  files       ProjectFile[]
  audits      Audit[]
}

model ProjectFile {
  id          String   @id @default(uuid())
  projectId   String   @map("project_id")
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  filename    String                              // path-like, e.g. src/routes/auth.js
  content     String
  contentHash String   @map("content_hash")      // sha256 hex of content (INCREMENTAL KEY)
  language    String?
  lineCount   Int      @default(0) @map("line_count")
  source      String   @default("upload")        // upload | paste | github
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  issues      Issue[]

  @@unique([projectId, filename])
}

model Audit {
  id                   String   @id @default(uuid())
  projectId            String   @map("project_id")
  project              Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  status               String   @default("queued")   // queued | running | completed | failed
  jobId                String?  @map("job_id")
  trigger              String   @default("manual")   // manual | ci
  incremental          Boolean  @default(false)
  analyzedFileCount    Int      @default(0) @map("analyzed_file_count")
  reusedFileCount      Int      @default(0) @map("reused_file_count")
  overallScore         Float?   @map("overall_score")
  securityScore        Float?   @map("security_score")
  performanceScore     Float?   @map("performance_score")
  maintainabilityScore Float?   @map("maintainability_score")
  debtScore            Float?   @map("debt_score")
  complexityScore      Float?   @map("complexity_score")     // from static metrics
  staticMetrics        Json?    @map("static_metrics")       // per-file metrics snapshot
  summary              String?
  totalIssues          Int      @default(0) @map("total_issues")
  criticalCount        Int      @default(0) @map("critical_count")
  errorMessage         String?  @map("error_message")
  createdAt            DateTime @default(now())
  completedAt          DateTime? @map("completed_at")
  issues               Issue[]
}

model Issue {
  id          String       @id @default(uuid())
  auditId     String       @map("audit_id")
  audit       Audit        @relation(fields: [auditId], references: [id], onDelete: Cascade)
  fileId      String?      @map("file_id")
  file        ProjectFile? @relation(fields: [fileId], references: [id])
  category    String                     // bug | security | performance | style | debt
  severity    String                     // critical | high | medium | low
  title       String
  description String
  suggestion  String?
  lineNumber  Int?         @map("line_number")
  resolved    Boolean      @default(false)
  createdAt   DateTime     @default(now())
}
```

Run `npx prisma db push && npx prisma generate` after writing the schema. If no `DATABASE_URL` is available in this environment, still generate the client and write everything so it runs on first deploy.

---

## 5. Auth & API surface

### 5.1 authMiddleware (INV-4)

`middleware/auth.js`: read `Authorization: Bearer <token>`, verify JWT, attach `req.user = { id, email }`, else 401. Terse, no session store.

### 5.2 Routes

All routes below except register/login/health require `authMiddleware`. Project-scoped routes additionally verify ownership (fetch project, compare `userId`, else 404 — return 404 not 403 to avoid resource enumeration).

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/auth/register` | bcrypt hash (10 rounds), create user, return `{token, user}` 201 |
| POST | `/api/auth/login` | verify, return `{token, user}`; wrong creds → 401 |
| GET | `/api/projects` | list current user's projects with latest audit summary |
| POST | `/api/projects` | create |
| GET | `/api/projects/:id` | project + files (id, filename, language, lineCount — not full content) + last 10 audits |
| PATCH | `/api/projects/:id` | update name/description |
| DELETE | `/api/projects/:id` | cascade delete |
| GET | `/api/projects/:id/files/:fileId` | full file content |
| POST | `/api/projects/:id/files` | add file(s): `[{filename, content}]`; compute sha256 `contentHash`, detect language by extension, upsert on `(projectId, filename)` |
| PUT | `/api/projects/:id/files/:fileId` | replace content → recompute hash + lineCount |
| DELETE | `/api/projects/:id/files/:fileId` | delete |
| POST | `/api/projects/:id/github/import` | body `{repoUrl, branch?}` — import repo (§8) |
| POST | `/api/projects/:id/audits` | **enqueue** audit job (never run inline). Body `{incremental?: boolean}` (default true when a prior completed audit exists). Create Audit row with `status: 'queued'`, add BullMQ job, return 202 `{auditId, jobId}` |
| GET | `/api/audits/:auditId` | audit status + scores + issues (poll target) |
| GET | `/api/projects/:id/audits` | audit history (for DebtTimeline) |
| PATCH | `/api/issues/:issueId/resolve` | toggle resolved (verify ownership via issue → audit → project) |
| GET | `/health` | 200, no auth |

Language detection map:

```js
const LANG_MAP = {
  '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript',
  '.tsx': 'typescript', '.py': 'python', '.java': 'java',
  '.cpp': 'cpp', '.c': 'c', '.rb': 'ruby', '.go': 'go',
  '.rs': 'rust', '.sql': 'sql', '.html': 'html', '.css': 'css',
};
```

---

## 6. The audit engine

Three layers, combined in the worker: static metrics (deterministic) → Gemini analysis (LLM) → weighted scoring.

### 6.1 Static metrics — `services/staticMetrics.js`

Pure functions, zero AI, fully unit-testable. This is what removes the "AI wrapper" criticism. Per file compute:

- **LOC** — non-empty, non-comment lines
- **Approx. cyclomatic complexity** — 1 + count of decision-point tokens: `if`, `else if`, `for`, `while`, `case`, `catch`, `&&`, `||`, `?` (ternary). Regex/token-count approximation is acceptable and must be documented as such in the README.
- **Max function length** — longest span between a function declaration token (`function`, `=>` with block, `def `) and its closing scope; a line-window heuristic is fine.
- **Duplication %** — normalize lines (trim, collapse whitespace), hash sliding 6-line windows, `duplicatedWindows / totalWindows * 100`.

Aggregate across files:

```js
// complexityScore: 0-100, higher = better
// avgComplexityPerFile <= 10 → 100; each point above 10 costs 4; floor 0.
// Then subtract duplicationPct * 0.5, floor 0.
function complexityToScore(avgComplexity, duplicationPct) {
  const base = Math.max(0, 100 - Math.max(0, avgComplexity - 10) * 4);
  return Math.max(0, Math.round(base - duplicationPct * 0.5));
}
```

Return shape:

```js
{
  perFile: [{ filename, loc, complexity, maxFunctionLength, duplicationPct }],
  totals: { loc, avgComplexity, duplicationPct },
  complexityScore  // 0-100
}
```

### 6.2 Gemini service — `services/gemini.js`

Single exported function with a **frozen signature** — the worker depends on it:

```js
// files: [{ filename, language, content }]
// returns: { scores: {security, performance, maintainability, debt}, issues: [...], summary: string }
async function runGeminiAudit(files) { ... }
```

Prompt (keep intact — it is the prompt-engineering showcase):

```
You are CodeLens, a senior staff engineer performing a comprehensive code audit.
Analyze this codebase thoroughly.

Codebase:
${files.map(f => `--- ${f.filename} (${f.language}) ---\n${f.content}`).join('\n\n')}

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
}
```

Hardening (production discipline):
- Strip ```json fences before `JSON.parse`; on parse failure retry once with an appended "Return ONLY the JSON object" instruction; on second failure throw with the raw response in the error for the worker to record in `Audit.errorMessage`.
- Validate the parsed shape (scores present and numeric 0–100, issues is array); clamp scores to [0, 100].
- Chunk if concatenated code exceeds ~80K characters: batch files into groups under the limit, call per batch, merge issue arrays, average scores weighted by batch LOC.

### 6.3 Scoring — `services/scoring.js` (INV-1)

The one true formula. Weights sum to exactly 1.0:

```js
// aiScores: {security, performance, maintainability, debt} each 0-100
// complexityScore: 0-100 from staticMetrics
function calculateOverallScore(aiScores, complexityScore) {
  const score = Math.round(
    aiScores.security        * 0.25 +
    aiScores.performance     * 0.20 +
    aiScores.maintainability * 0.20 +
    aiScores.debt            * 0.15 +
    complexityScore          * 0.20
  );
  return Math.min(100, Math.max(0, score));
}
```

Write `scoring.test.js` asserting: (a) all-100 inputs → exactly 100, (b) weights literal sum === 1.0, (c) output clamped.

---

## 7. Async queue + worker (INV-2, INV-3)

### 7.1 Connection & queue — `lib/queue.js`

```js
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,                    // BullMQ hard requirement (INV-3)
  ...(process.env.REDIS_URL?.startsWith('rediss://')
    ? { tls: { rejectUnauthorized: false } }      // Upstash TLS (INV-3)
    : {}),
});

const auditQueue = new Queue('audits', { connection });
module.exports = { auditQueue, connection };
```

### 7.2 Worker — `src/worker.js` (separate process: `npm run worker`)

Job data: `{ auditId, projectId, incremental }`. Flow:

1. Mark audit `running`.
2. Load all project files (id, filename, language, content, contentHash).
3. **Incremental partition** (only when `incremental === true` AND a prior `completed` audit exists):
   - Load the previous completed audit's `staticMetrics.perFile` and its issues (with `file.contentHash` at the time — store `contentHash` inside each `staticMetrics.perFile` entry to enable this comparison).
   - `changed` = files whose current `contentHash` differs from the previous snapshot, plus files new since then. `unchanged` = the rest.
   - Analyze only `changed` with Gemini; **carry forward** unchanged files' unresolved issues by re-inserting copies pointed at the new audit (fresh Issue rows, `resolved: false` only for previously-unresolved ones). Recompute static metrics for ALL files (cheap, deterministic).
   - Record `analyzedFileCount` / `reusedFileCount` on the Audit.
   - If everything is unchanged, skip Gemini entirely; reuse previous AI scores.
   - Full (non-incremental) audits analyze everything.
4. `staticMetrics = analyzeStaticMetrics(allFiles)`.
5. `aiResult = await runGeminiAudit(changedFiles)` (or reuse per step 3).
6. `overallScore = calculateOverallScore(aiResult.scores, staticMetrics.complexityScore)` (§6.3).
7. **Persist in one `prisma.$transaction`** (INV-2):
   - Update the Audit row: `status: 'completed'`, all five sub-scores + `overallScore` + `complexityScore`, `summary`, `staticMetrics`, `totalIssues`, `criticalCount`, `completedAt`.
   - `prisma.issue.createMany` with ALL issues (new + carried forward), mapping `filename → fileId` via a filename lookup built in step 2; unknown filename → `fileId: null`:

     ```js
     await tx.issue.createMany({
       data: allIssues.map(issue => ({
         auditId,
         fileId:      fileIdByName.get(issue.filename) ?? null,
         category:    issue.category,
         severity:    issue.severity,
         title:       issue.title,
         description: issue.description,
         suggestion:  issue.suggestion || null,
         lineNumber:  issue.line_number ?? null,
         resolved:    false,
       })),
     });
     ```
   - Update the project:

     ```js
     await tx.project.update({
       where: { id: projectId },
       data: { debtScore: aiResult.scores.debt, lastAuditAt: new Date() },
     });
     ```
8. On any error: mark audit `failed` with `errorMessage`, rethrow so BullMQ records the failure. Worker options: `attempts: 2`, exponential backoff 5s, `concurrency: 2`.

`index.js` (the API) must NOT import or start the worker. Two processes: `npm run dev` (API) and `npm run worker`. On Railway, run both via a `Procfile`-style setup or two services; document both options in the README.

---

## 8. GitHub repo import — `services/githubImport.js`

`POST /api/projects/:id/github/import` with `{repoUrl, branch = 'main'}`:

1. Parse `owner/repo` from the URL (support `https://github.com/owner/repo` and `owner/repo`); 400 on garbage.
2. Octokit (anonymous, or with the user's stored `githubToken` if present):
   - `repos.getBranch` → HEAD sha (store as `lastSyncSha`)
   - `git.getTree(tree_sha, recursive: true)`
3. Filter blobs: extension ∈ LANG_MAP keys; skip paths containing `node_modules/`, `dist/`, `build/`, `.min.`, `vendor/`, lockfiles; skip blobs > 100 KB; hard cap **50 files** (take largest-first by size after filtering, then warn in the response about skipped count).
4. Fetch contents via `git.getBlob` (base64 → utf8).
5. Upsert as ProjectFiles with `source: 'github'`, computing `contentHash` — the upsert-on-`(projectId, filename)` + hash design means **re-importing after new commits automatically feeds the incremental audit path**. That's the point.
6. Update `project.repoUrl`, `repoBranch`, `lastSyncSha`, detect dominant `language`.
7. Return `{imported, skipped, headSha}`.

Handle rate limits (403 with `x-ratelimit-remaining: 0`) with a clear user-facing message suggesting a PAT in Settings.

---

## 9. CI/CD

### 9.1 `ci.yml` — tests

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: cd server && npm ci && npx prisma generate && npm test
```

Unit tests must not require live Postgres/Redis — mock the Prisma client in route tests (or scope tests to pure services: scoring, staticMetrics, language detection, incremental partition logic).

### 9.2 `codelens-audit.yml` — audit on PR (the DevTool showcase)

Reusable workflow the user copies into any target repo:

```yaml
name: CodeLens Audit
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Trigger CodeLens audit
        env:
          CODELENS_API: ${{ secrets.CODELENS_API_URL }}
          CODELENS_TOKEN: ${{ secrets.CODELENS_TOKEN }}
          CODELENS_PROJECT: ${{ secrets.CODELENS_PROJECT_ID }}
        run: |
          RESP=$(curl -s -X POST "$CODELENS_API/api/projects/$CODELENS_PROJECT/audits" \
            -H "Authorization: Bearer $CODELENS_TOKEN" \
            -H "Content-Type: application/json" \
            -d '{"incremental": true, "trigger": "ci"}')
          AUDIT_ID=$(echo "$RESP" | jq -r .auditId)
          for i in $(seq 1 60); do
            sleep 5
            STATUS=$(curl -s "$CODELENS_API/api/audits/$AUDIT_ID" \
              -H "Authorization: Bearer $CODELENS_TOKEN")
            [ "$(echo "$STATUS" | jq -r .status)" = "completed" ] && break
            [ "$(echo "$STATUS" | jq -r .status)" = "failed" ] && exit 1
          done
          echo "$STATUS" > audit.json
      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            const audit = require('./audit.json');
            const body = [
              `## CodeLens Audit — Score: ${audit.overallScore}/100`,
              `Security ${audit.securityScore} · Performance ${audit.performanceScore} · Maintainability ${audit.maintainabilityScore} · Debt ${audit.debtScore} · Complexity ${audit.complexityScore}`,
              `Issues: ${audit.totalIssues} (${audit.criticalCount} critical) · Analyzed ${audit.analyzedFileCount} files, reused ${audit.reusedFileCount}`,
            ].join('\n\n');
            github.rest.issues.createComment({
              ...context.repo, issue_number: context.issue.number, body,
            });
```

Server side: accept `trigger: 'ci'` in the audit POST body and store it on the Audit row. Add `services/prComment.js` that formats a markdown summary (used by a `GET /api/audits/:auditId/markdown` endpoint the Action can optionally use instead of building the comment itself).

---

## 10. Frontend

Build order (each page works before the next): Login/Register → Dashboard → ProjectView → AuditReport → DebtTimeline → Settings.

### ProjectView — the star page

```
+-------+-----------------------------+------------------+
| Files | Code Viewer (syntax HL)     | Issues Panel     |
| Tree  |                             | filtered by      |
|       | [Run Audit] [Import GitHub] | selected file,   |
| + Add |                             | severity chips,  |
|       | Tabs: file1.js | file2.py   | resolve toggle   |
+-------+-----------------------------+------------------+
```

- File add: paste with filename, drag-drop upload, GitHub raw URL, **GitHub repo import modal** (repo URL + branch → shows imported/skipped counts).
- Run Audit → POST returns 202 → `AuditProgress` polls `GET /api/audits/:id` every 2s, showing status stages ("Queued…", "Computing static metrics…", "AI analysis on N changed files…", "Scoring…"). On `completed`, navigate to AuditReport. On `failed`, show `errorMessage` with retry.
- Incremental toggle (default on when prior audit exists) with a caption: "Only changed files are re-analyzed."

### AuditReport
- `ScoreGauge` (circular SVG): 0–40 red, 41–70 amber, 71–85 blue, 86–100 green.
- Five sub-score mini-gauges including **Complexity** (static).
- `MetricsPanel`: per-file LOC / complexity / duplication table from `staticMetrics`.
- Issues grouped by severity; filter by category/file; resolve toggle (PATCH).
- Badge when incremental: "Incremental audit — N analyzed, M reused."

### DebtTimeline
- Recharts line chart of `overallScore` and `debtScore` across audits; dots colored by score band; hover shows counts.

### Dashboard
- Project cards: name, language, debt score badge, last audit time, sparkline of last 5 overall scores.

Visual bar: dark, dev-tool aesthetic (SonarQube/Linear energy) — not a bootstrap-y student project. Consistent spacing, monospace where code appears, restrained accent color. No emoji in UI chrome.

---

## 11. Execution plan for Claude Code

Work phase-by-phase. After each phase, run the phase's verification before proceeding. Commit per phase with a conventional message.

| Phase | Scope | Verify |
|---|---|---|
| 1 | Scaffold monorepo, install deps, `.env.example`s, Prisma schema, `prisma generate`, shared `lib/prisma.js` | `npx prisma validate` passes; server boots with `assertEnv` errors listing missing vars |
| 2 | Auth (routes + middleware), health route | Jest: register 201+token, wrong-password 401; all other routes 401 without token |
| 3 | Projects + files CRUD (hashing, language detection, ownership checks) | Jest: create/list scoped to user; upsert recomputes hash; cross-user access → 404 |
| 4 | Static metrics + scoring services | Jest: `scoring.test.js` (weights sum 1.0, clamp), `staticMetrics.test.js` (known fixture file → expected complexity/duplication) |
| 5 | Gemini service (JSON hardening, chunking) | Unit test the fence-stripping/validation with mocked responses |
| 6 | Queue + worker (INV-2/INV-3), audit routes (enqueue/status) | Code review checklist below; if Redis available locally, integration smoke: enqueue → completed → Issue rows exist |
| 7 | Incremental service | Jest: partition logic — changed/new/unchanged fixture cases; all-unchanged skips AI path |
| 8 | GitHub import | Unit test URL parsing + tree filtering with mocked Octokit |
| 9 | Frontend, all pages | `npm run build` clean; manual flow: register → project → add 3 files → audit → report → resolve → timeline |
| 10 | CI workflows, README (arch diagram, endpoint table, scoring methodology, metric approximation disclaimer, demo account note, setup) | `ci.yml` valid YAML; README complete |

**Phase 6 mandatory self-review checklist (print the answers):**
- [ ] Do scoring weights sum to exactly 1.0? (INV-1)
- [ ] Does the worker call `issue.createMany` AND `project.update` inside the transaction? (INV-2)
- [ ] Does the IORedis connection set `maxRetriesPerRequest: null` and TLS for `rediss://`? (INV-3)
- [ ] Is `authMiddleware` on `POST /:projectId/audits` and `GET /api/audits/:auditId`, with ownership checks? (INV-4)
- [ ] Does the API process avoid importing the worker?
- [ ] Is `runGeminiAudit(files)` returning exactly `{scores, issues, summary}`?

### Definition of done
- All Jest suites green; `client` builds with zero errors.
- A full manual walkthrough works end-to-end against local Postgres + Redis (or is code-complete with documented deploy steps if services are unavailable in the build environment).
- README documents: architecture, every endpoint, the weighted scoring formula, the incremental algorithm, the static-metric approximations, GitHub Action setup, and local + Railway/Vercel deploy steps.
- No secret committed anywhere; `.env` in `.gitignore`.

### Out of scope (do not build)
Multi-user collaboration/sharing, comments on issues, webhooks-based auto-sync, DeepFace-style extras, payment/teams. Ship the above first.
