# CLAUDE.md — session orientation for medcode-api

## What this is

Spring Boot 4.1 / Java 21 clone of the Flask POC backend at
`../audit_chart/audit-chart_doc/integration-poc/server/` (which stays untouched
as the frozen reference implementation). Serves the exact JSON contract in
`../audit_chart/src/api/types.ts`; the React frontend switches over by changing
`VITE_API_BASE` only. Build/run/test commands: see `README.md`.

## The golden rule

We are **cloning** the Flask API, not improving it. Key order, absent-vs-null
fields, error message text, and the sha1 fake-data math are all part of the
contract. The correctness gate is the parity harness (`scripts/parity_read.py`,
`scripts/parity_write.py`, `scripts/gen_fakes_golden.py` — usage in README),
not code review. If a Flask behavior looks like a bug, clone it anyway.

## Layout conventions

- Layers: `web/` (controllers) → `service/` (logic) → `repo/` (ALL SQL).
- Every repo method carries a comment naming its Python source line
  (`// views.py:117`); services read step-by-step like their Python originals.
- Responses are `LinkedHashMap<String,Object>` — never records, never JPA —
  so key order and absent-vs-null stay one-line decisions per field.
- `service/Py.java` replicates Python semantics (or-falsiness, `[:n]` slices).
- Single-instance concurrency model: one write `ReentrantLock` + an in-process
  `cases.json` cache (`CasesCache`), invalidated after approve/reopen/reset —
  NOT after codes/draft saves. Never scale past one instance.

## Progress

Milestones from the migration plan (git log --oneline reads as this sequence):

- ✅ **M0** skeleton, health endpoints, local PG seeding
- ✅ **M1** DeterministicFakes port + golden parity test
- ✅ **M2** read endpoints, full parity with Flask
- ✅ **M3** working-state writes (PUT codes/draft)
- ✅ **M4** approve + reopen, full write parity
- ✅ **M5** demo reset
- ✅ **M6** CORS, Dockerfile, deploy docs — all parity gates green
- ⬜ **M7 — cutover (NOT done):** point Spring at the prod DB, rerun
  `parity_read.py` there, flip `VITE_API_BASE` in the frontend, drive the real
  UI; Flask stays deployed as instant rollback.

Deploy direction (decided 2026-07-21): **GCP, two containers** — this backend's
Dockerfile + a stock `postgres:18` — NOT Supabase/Render (cost). Exact GCP
service (VM+compose vs Cloud Run vs GKE) not chosen yet. Must run a single
backend instance (`max-instances=1` on Cloud Run).

**Update this section when a milestone or significant decision lands.**

## Gotchas still live

- sha1 math must stay on `BigInteger` end-to-end — never truncate to `long`.
- Timestamps/JSONB always come back as raw strings: `::text` casts +
  `getString`; never let JDBC parse them into objects.
- Never `ORDER BY` a PG ENUM column bare — the verbatim `CASE` expressions
  copied from views.py ARE the contract.
- JDBC URL needs `stringtype=unspecified` (writes into ENUM/JSONB columns)
  and `binaryTransfer=false`.
- Absent-vs-null field mistakes are only caught by the full-payload parity
  diff — run the harness after any response-shape change.

## Full history

- Complete migration plan (context, file mapping, gotchas):
  `~/.claude-work/plans/what-is-current-backend-refactored-gosling.md`
- Ground-truth Python sources to port from are listed at the end of that plan.
