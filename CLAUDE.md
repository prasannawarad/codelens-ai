# CodeLens AI

Full-stack AI code-audit platform: React/Vite client, Express + Prisma API, BullMQ/Redis
audit worker, Gemini analysis + deterministic static metrics. Built to the spec in
`CODELENS_AI_BUILD_SPEC.md` — the spec is the source of truth for schema, route
contracts and the four invariants (INV-1..4); don't deviate from it casually.

## Commands

```bash
cd server && npm run dev      # API :3001 (never runs audits inline)
cd server && npm run worker   # BullMQ worker — separate process, required for audits
cd server && npm test         # Jest, 113 tests, no live services needed
cd client && npm run dev      # Vite :5173
cd client && npm run build    # must stay clean
cd server && npx prisma db push   # after schema changes
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

## Environment

`server/.env.example` and `client/.env.example` list everything. Local dev uses
Homebrew Postgres (`postgresql://prasannawarad@localhost:5432/codelens`) and local Redis.

## What does NOT exist

- No client-side test suite (server Jest only; client is verified by `npm run build`).
- No migrations directory — schema is applied with `prisma db push`.
- No seeded demo account; register locally.
- No webhook auto-sync, comments, or multi-user sharing (explicitly out of scope).
