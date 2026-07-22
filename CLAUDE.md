# CLAUDE.md — session orientation for medcode-api

## What this is

Spring Boot 4.1 / Java 21 clone of the Flask POC backend at
`../audit_chart/audit-chart_doc/integration-poc/server/` (which stays untouched
as the frozen reference implementation). Serves the exact JSON contract in
`../audit_chart/src/api/types.ts`; the React frontend switches over by changing
`VITE_API_BASE` only. Build/run/test commands: see `README.md`.

## The golden rule

We are **cloning** the Flask API, not improving it — key order, absent-vs-null
fields, and error message text are all part of the contract. If a Flask
behavior looks like a bug, clone it anyway.

**Exception (decided 2026-07-22):** the sha1-based fake-data layer
(`DeterministicFakes`, formerly guarded by a Python-generated golden file) has
been permanently removed. Six fields — `confidence`, `patient`, `hn`,
`created_at`/`updated_at`, `revenue_impact`, and `coder`/`coders`/`reopenedBy`
— now return real DB values (null where no real value exists) instead of
Flask's synthesized placeholders. This is a deliberate, permanent divergence
from the Flask reference for those fields specifically; everything else
stays a faithful clone. Frontend contract reconciliation
(`../audit_chart/src/api/types.ts`, which currently types several of these
fields as required/non-nullable) is explicitly out of scope for this repo.

The correctness gate is now the Java integration test suite
(`CasesApiIntegrationTest`, `./mvnw test` — usage in README), not code review
and not a live-Flask diff.

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
- ✅ **Fake-data removal (2026-07-22):** dropped `DeterministicFakes` entirely;
  `confidence`/`patient`/`hn`/`created_at`/`updated_at`/`revenue_impact`/
  `coder` now serve real DB values (null where none exists). Python parity
  scripts (`parity_read.py`, `parity_write.py`, `gen_fakes_golden.py`) deleted
  along with the golden fixture; replaced by `CasesApiIntegrationTest`
  (MockMvc against the local seeded DB). Frontend contract reconciliation
  deferred — see "The golden rule."
- ⬜ **M7 — cutover (NOT done):** point Spring at the prod DB, rerun the
  integration test suite there, flip `VITE_API_BASE` in the frontend, drive
  the real UI; Flask stays deployed as instant rollback.

Deploy direction (decided 2026-07-21): **GCP, two containers** — this backend's
Dockerfile + a stock `postgres:18` — NOT Supabase/Render (cost). Exact GCP
service (VM+compose vs Cloud Run vs GKE) not chosen yet. Must run a single
backend instance (`max-instances=1` on Cloud Run).

**Update this section when a milestone or significant decision lands.**

## Gotchas still live

- Timestamps/JSONB always come back as raw strings: `::text` casts +
  `getString`; never let JDBC parse them into objects.
- Never `ORDER BY` a PG ENUM column bare — the verbatim `CASE` expressions
  copied from views.py ARE the contract.
- JDBC URL needs `stringtype=unspecified` (writes into ENUM/JSONB columns)
  and `binaryTransfer=false`.
- Absent-vs-null field mistakes are only caught by a full-payload diff —
  run `./mvnw test` (`CasesApiIntegrationTest`) after any response-shape
  change.

## Open tasks

- **Split iMed integration into its own app.** `ImedWritebackRepository.java`
  is currently the only class touching the `imed` schema (called from
  `ApprovalService`) — today it's raw JDBC against the local Postgres mock.
  Decided (2026-07-22): this will eventually move to its own separate
  folder/repo/Spring Boot application, not an in-repo interface/gateway.
  Not started; no timeline yet.

## Full history

- Complete migration plan (context, file mapping, gotchas):
  `~/.claude-work/plans/what-is-current-backend-refactored-gosling.md`
- Ground-truth Python sources to port from are listed at the end of that plan.
