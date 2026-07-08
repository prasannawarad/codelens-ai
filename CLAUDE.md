# CodeLens AI

Full-stack AI code-audit platform: React/Vite client, Express + Prisma API, BullMQ/Redis
audit worker, Gemini analysis + deterministic static metrics. Built to the spec in
`CODELENS_AI_BUILD_SPEC.md` — the spec is the source of truth for schema, route
contracts and the four invariants (INV-1..4); don't deviate from it casually.

## Commands

```bash
cd server && npm run dev      # API :3001 (never runs audits inline)
cd server && npm run worker   # BullMQ worker — separate process, required for audits
cd server && npm test         # Jest, 131 tests, no live services needed
cd server && npm run seed     # demo account: demo@codelens.dev / codelens-demo
cd server && npm run eval     # eval harness vs golden set (GEMINI_API_KEY=demo ok)
cd client && npm run dev      # Vite :5173
cd client && npm run build    # must stay clean
cd server && npx prisma migrate dev   # after schema changes (migrations are committed)
docker compose up --build    # full stack in containers (demo mode)
cd e2e && npm test            # browser flow (stack must be running)
```

## Architecture (the parts that bite)

- **One PrismaClient**, exported from `server/src/lib/prisma.js`. Never instantiate another.
- **API and worker are separate processes.** `src/index.js` must never import `src/worker.js`.
- **INV-1:** scoring weights in `services/scoring.js` sum to exactly 1.0 (test enforces it).
- **INV-2:** the worker persists Issues + Audit completion + `project.debtScore`/`lastAuditAt`
  in one `prisma.$transaction`. An audit without Issue rows is a failed audit.
- **INV-3:** `lib/queue.js` sets `maxRetriesPerRequest: null` and TLS for `rediss://`. BullMQ breaks without it.
- **INV-4:** everything except register/login/health goes through `authMiddleware`, and
  project-scoped handlers also check ownership — returning **404**, not 403.
- Incremental audits diff `contentHash` against the previous completed audit's
  `staticMetrics.perFile` snapshot. The snapshot is written by `analyzeStaticMetrics`
  receiving files **with** `contentHash` — don't strip that field.
- `runGeminiAudit(files)` has a frozen signature returning `{scores, issues, summary}`.
  `GEMINI_API_KEY=demo` switches to a deterministic heuristic scanner (keep this fallback).
- GitHub PATs are AES-256-GCM encrypted at rest via `lib/secretBox.js`; the key derives
  from `JWT_SECRET`, so rotating JWT_SECRET silently invalidates stored PATs.
- Auth rate limiting (`express-rate-limit`) is skipped when `NODE_ENV === 'test'`.
- `GET /api/audits/:id/diff` compares against the previous completed audit; issues match
  on (filename, category, title) — not line numbers.

## Environment

`server/.env.example` and `client/.env.example` list everything. Local dev uses
Homebrew Postgres (`postgresql://prasannawarad@localhost:5432/codelens`) and local Redis.

## Deployment (live)

- Client: https://codelens-ai-olive.vercel.app (Vercel project `codelens-ai`).
- API + worker + Postgres + Redis: Railway project `codelens-ai`, deployed via
  `railway up --service api|worker` with `RAILWAY_DOCKERFILE_PATH=Dockerfile.railway`
  (the CLI uploads the git root, so `server/Dockerfile` is ignored there).
- Live stack runs `GEMINI_API_KEY=demo`; swap the Railway variable for real AI analysis.

## Gotchas added later

- The eval golden set (`server/eval/golden/`) is intentionally flawed code — never "fix"
  those files; labels in `golden.json` reference exact line numbers.
- CI runs the demo-engine eval as a regression gate; changing demo heuristics in
  `gemini.js` can break it.
- `server/openapi.yaml` is the API contract artifact — update it with route changes.
- Docker server image needs `apk add openssl` (Prisma engines) — already in the Dockerfile.

## What does NOT exist

- No client-side unit tests (server Jest + browser e2e in `e2e/`; client build must stay clean).
- No webhook auto-sync, comments, or multi-user sharing (explicitly out of scope).
