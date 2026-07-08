# CodeLens AI

**Live demo:** [codelens-ai-olive.vercel.app](https://codelens-ai-olive.vercel.app) — log in as `demo@codelens.dev` / `codelens-demo` (seeded project with a three-week audit history), or register your own account. API: [api-production-b5a7.up.railway.app](https://api-production-b5a7.up.railway.app/health). Runs in demo audit mode (deterministic heuristics).

AI code audit and technical-debt tracking platform — SonarQube + LLM energy on a free-tier stack. Create projects, add code (paste, upload, or GitHub repo import), run audits that combine **deterministic static metrics** with **Gemini LLM analysis**, get a weighted 0–100 score and per-file issue list, then fix, re-audit and watch the debt trend. Audits run asynchronously on a BullMQ/Redis queue, and re-audits are **incremental** — only changed files (content-hash diff) are re-analyzed.

| | |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Workspace](docs/screenshots/workspace.png) |
| ![Audit report](docs/screenshots/report.png) | ![Debt timeline](docs/screenshots/timeline.png) |

## Architecture

```
┌──────────────┐        ┌───────────────────────────┐        ┌──────────────┐
│ React client │  HTTP  │ Express API (src/index.js)│ enqueue│ Redis        │
│ Vite + TW v4 ├───────►│ JWT auth · ownership      ├───────►│ BullMQ queue │
│ (Vercel)     │        │ checks · 202 + poll       │        │ (Upstash)    │
└──────────────┘        └─────────────┬─────────────┘        └──────┬───────┘
                                      │                             │ job
                          ┌───────────▼─────────────┐   ┌───────────▼──────────┐
                          │ PostgreSQL (Supabase)   │◄──┤ Worker (src/worker.js)│
                          │ User Project ProjectFile│ tx│ static metrics →     │
                          │ Audit Issue             │   │ Gemini → scoring     │
                          └─────────────────────────┘   └──────────────────────┘
```

Two server processes, one codebase: the API never runs audits inline and never imports the worker. The worker consumes `audits` jobs, computes static metrics for all files, calls Gemini for changed files only, and persists Issues + Audit scores + project debt score in **one Prisma transaction**.

## Quick start

**Docker (one command):**

```bash
docker compose up --build          # app on :5173, API on :3001, demo audit mode
docker compose exec api npm run seed   # optional: demo account + audit history
```

**Bare metal:** Node 20+, PostgreSQL, Redis.

```bash
# server
cd server
npm install
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, REDIS_URL, GEMINI_API_KEY
npx prisma migrate deploy   # applies committed migrations
npm run dev                 # API on :3001

# worker (second terminal)
cd server && npm run worker

# client (third terminal)
cd client
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:3001
npm run dev                 # app on :5173
```

**Demo mode (no Gemini key/quota):** set `GEMINI_API_KEY=demo`. Audits then use a deterministic heuristic scanner (eval usage, hardcoded credentials, TODOs, debug output) instead of the LLM — the full pipeline, queue, scoring and UI behave identically.

**Demo account:** `cd server && npm run seed` creates `demo@codelens.dev` / `codelens-demo` with a realistic project (`acme-payments-api`) and four backdated audits showing a three-week debt paydown (63 → 71 → 79 → 87) — the dashboard, timeline and diff views look alive immediately. Re-running the seed resets it.

## API

All routes except register/login/health require `Authorization: Bearer <JWT>` (7-day expiry). Project-scoped routes verify ownership and return **404** (not 403) on foreign resources to avoid enumeration. Register/login are rate-limited (30 req / 15 min per IP). Stored GitHub PATs are encrypted at rest with AES-256-GCM (key derived from `JWT_SECRET` — rotating it invalidates stored tokens). If Redis is unreachable, audit enqueue returns 503 and marks the audit row failed instead of leaving it orphaned.

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/auth/register` | bcrypt(10), returns `{token, user}` 201 |
| POST | `/api/auth/login` | verify, `{token, user}`; wrong creds → 401 |
| GET | `/api/auth/me` | profile + `hasGithubToken` (PAT never echoed) |
| PATCH | `/api/auth/me` | update name / set / clear GitHub PAT |
| GET | `/api/projects` | user's projects + last 5 audit summaries |
| POST | `/api/projects` | create |
| GET | `/api/projects/:id` | project + file metadata (no content) + last 10 audits |
| PATCH | `/api/projects/:id` | update name/description |
| DELETE | `/api/projects/:id` | cascade delete |
| POST | `/api/projects/:id/files` | add `[{filename, content}]`; sha256 hash, language by extension, upsert on `(projectId, filename)` |
| GET | `/api/projects/:id/files/:fileId` | full content |
| PUT | `/api/projects/:id/files/:fileId` | replace content → recompute hash + lineCount |
| DELETE | `/api/projects/:id/files/:fileId` | delete |
| POST | `/api/projects/:id/github/import` | `{repoUrl, branch?}` → import repo (see below) |
| POST | `/api/projects/:id/audits` | **enqueue** audit (never inline). `{incremental?, trigger?}` → 202 `{auditId, jobId}` |
| GET | `/api/projects/:id/audits` | audit history (timeline) |
| GET | `/api/audits/:auditId` | status + scores + issues (poll target) |
| GET | `/api/audits/:auditId/diff` | deltas vs the previous completed audit: score changes + new/fixed issues |
| GET | `/api/audits/:auditId/markdown` | PR-comment markdown for CI |
| PATCH | `/api/issues/:issueId/resolve` | toggle resolved |
| GET | `/api/admin/stats` | queue counts + caller-scoped audit aggregates (Settings → System) |
| GET | `/health` | 200, no auth |

The full API contract lives in [`server/openapi.yaml`](server/openapi.yaml) (OpenAPI 3.0).

## The audit engine

### 1. Static metrics (deterministic, no AI)

Per file: LOC (non-empty, non-comment), approximate cyclomatic complexity, max function length, duplication %.

> **Approximation disclaimer:** these are token/line-window heuristics, not AST analysis. Complexity = 1 + count of decision-point tokens (`if`, `for`, `while`, `case`, `catch`, `&&`, `||`, ternary `?`). Function length uses brace-depth tracking (`function`/`=> {`) and indent tracking (`def`). Duplication hashes sliding 6-line normalized windows — pooled across files, so cross-file copy-paste counts. Good enough to trend and to compare files; not a compiler.

Complexity score: `max(0, 100 − max(0, avgComplexity − 10) × 4) − duplicationPct × 0.5`, floored at 0.

### 2. Gemini analysis

`services/gemini.js` sends the codebase with a fixed audit prompt covering bugs / security / performance / style / debt and demands strict JSON. Hardening: code-fence stripping, one retry with a "JSON only" instruction, shape validation, score clamping to [0, 100], and batching when concatenated code exceeds ~80K chars (issues merged, scores LOC-weighted). Model: `gemini-1.5-flash` (override with `GEMINI_MODEL`).

### 3. Weighted scoring

Weights sum to exactly 1.0 (unit-tested):

```
overall = security×0.25 + performance×0.20 + maintainability×0.20
        + debt×0.15 + complexity×0.20        → clamped to [0, 100]
```

Score bands: 0–40 red · 41–70 amber · 71–85 blue · 86–100 green.

### Incremental audits

Each completed audit snapshots every file's `contentHash` inside `staticMetrics.perFile`. The next incremental audit diffs current hashes against that snapshot:

- **changed + new files** → re-analyzed by Gemini
- **unchanged files** → their unresolved issues are carried forward as fresh Issue rows; resolved ones stay resolved
- **all unchanged** → Gemini is skipped entirely; previous AI scores are reused
- static metrics are recomputed for all files every audit (cheap, deterministic)

The Audit row records `analyzedFileCount` / `reusedFileCount`, shown in the UI badge and PR comment.

## Evaluating the auditor (the part most AI projects skip)

`server/eval/` is a measurement harness for the audit engine itself: a **golden dataset of 14 files** (12 with hand-labeled defects across all five categories, 2 clean controls) and a scorer that fuzzy-matches AI findings to labels on category + keyword/line (±3). It reports **precision** (findings that matched a real defect), **recall** (labeled defects found) and F1, overall and per category.

```bash
cd server
GEMINI_API_KEY=demo npm run eval     # deterministic heuristic engine
GEMINI_API_KEY=<key> npm run eval    # live Gemini
npm run eval -- --limit 5            # token-frugal subset
```

Baseline results (committed in `eval/results/`), demo heuristic engine:

| Metric | Value | Notes |
|---|---|---|
| Precision | **100%** (4/4) | zero false positives, including on the 2 clean files |
| Recall | **30.8%** (4/13) | catches pattern-matchable defects (eval, secrets, TODOs, debug output) |
| Recall by category | security 50% · debt 50% · style 33% · bug 0% · perf 0% | logic/architecture defects need the LLM |

That gap **is the point**: the harness quantifies exactly what LLM analysis adds over static heuristics, and CI re-runs the demo-engine eval on every push as a regression gate. Run it with a Gemini key to benchmark models/prompts against the same labels.

## GitHub repo import

`POST /api/projects/:id/github/import` fetches the branch HEAD and recursive tree via Octokit (anonymous, or the user's PAT from Settings for private repos / higher rate limits). Filters: known code extensions only; skips `node_modules/`, `dist/`, `build/`, `vendor/`, `.min.`, lockfiles; skips blobs > 100 KB; caps at 50 files (largest first, remainder reported as `skipped`). Files upsert on `(projectId, filename)` with fresh hashes — **re-importing after new commits feeds the incremental audit path automatically**.

## Audit-on-PR GitHub Action

Copy `.github/workflows/codelens-audit.yml` into any target repo and set three secrets:

| Secret | Value |
|---|---|
| `CODELENS_API_URL` | your deployed API base URL |
| `CODELENS_TOKEN` | a JWT from `POST /api/auth/login` |
| `CODELENS_PROJECT_ID` | the CodeLens project linked to the repo |

On every PR it enqueues an incremental audit (`trigger: "ci"`), polls to completion and comments the score summary on the PR.

## Tests & CI

```bash
cd server && npm test    # 131 unit tests: auth, CRUD/ownership, scoring, static
                         # metrics, Gemini hardening, incremental, GitHub
                         # import, PAT encryption, audit diff, eval metrics
cd e2e && npm test       # real-browser flow: register → project → files →
                         # audit → report → resolve → timeline (needs the
                         # stack running; CI provisions it automatically)
```

Unit tests mock Prisma, the queue and the Gemini SDK — no live services needed. CI (`.github/workflows/ci.yml`) runs three gates on every push/PR: unit tests + client build, the **eval-harness regression** (demo engine against the golden set), and the **browser e2e job** against real Postgres/Redis service containers.

## Operations

- **Structured logs:** pino JSON with per-request IDs (`x-request-id` honored); `LOG_LEVEL` env.
- **System stats:** `GET /api/admin/stats` (surfaced in Settings → System) — queue depth, audit counts, average audit duration.
- **Graceful shutdown:** both processes drain on SIGTERM/SIGINT (Railway/K8s friendly).
- **Migrations:** committed Prisma migrations (`prisma migrate deploy` on boot in Docker; `prisma migrate dev` for schema changes).
- **Failure posture:** Redis-down enqueue → 503 + audit row marked failed; Gemini JSON failures → one retry then recorded in `errorMessage`; GitHub rate limits → actionable 429.

## Deployment

The live deployment runs on **Railway** (Postgres + Redis + `api` + `worker` services, all four in one project) and **Vercel** (client). To reproduce:

- **Railway:** create a project, add Postgres + Redis, then two services deployed from the repo with `RAILWAY_DOCKERFILE_PATH=Dockerfile.railway` (monorepo root context). The `api` service gets `DATABASE_URL`/`REDIS_URL` references, `JWT_SECRET`, `GEMINI_API_KEY`, `CORS_ORIGIN` (your Vercel URL); the `worker` service gets the same plus `SERVICE_ROLE=worker` (one image, two roles). Migrations run on boot (`prisma migrate deploy`).
- **Client on Vercel:** root `client/`, framework Vite, env `VITE_API_URL` = the Railway API URL. `client/vercel.json` provides the SPA fallback rewrite.
- **Alternative managed stores:** Supabase Postgres and Upstash Redis (`rediss://…`) drop in via the same env vars — BullMQ's Upstash TLS requirements (`maxRetriesPerRequest: null`, `rejectUnauthorized: false`) are already handled.
- Seed the live demo account with `DATABASE_URL=<public-url> npm run seed` from `server/`.

## Environment variables

See `server/.env.example` (`DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `REDIS_URL`, `PORT`, `CORS_ORIGIN`) and `client/.env.example` (`VITE_API_URL`). Secrets live only in gitignored `.env` files / platform secret stores.

## Out of scope (intentionally)

Multi-user collaboration/sharing, issue comments, webhook auto-sync, payments/teams.
