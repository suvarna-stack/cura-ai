# CLAUDE.md — session orientation for medcode-api

## What this is

Spring Boot 4.1 / Java 21 backend for MedCode AI (medical-coding audit
dashboard). Originally a query-for-query clone of the Flask POC at
`../audit_chart/audit-chart_doc/integration-poc/server/` — that POC (and the
whole audit_chart repo) is now **historical reference only**, never edited,
never needed at runtime or setup time. Owns the `medcode` Postgres database;
sends approval results to the hospital's iMed API — locally the sibling repo
`../imed-mock-api`, a fake hospital server owning the separate `imed`
database. Build/run/test commands: see `README.md`.

## The golden rule (rewritten 2026-07-22 — the Flask-clone era is over)

**This backend owns the API contract.** The old React frontend is being
retired; the next one will be built against `docs/api-contract.md` +
`docs/types.ts`. Consequences:

- Key order, absent-vs-null choices, and error text are OUR decisions now —
  deliberate and documented, not cloned. When changing any response shape,
  update `docs/api-contract.md` + `docs/types.ts` + `CasesApiIntegrationTest`
  in the same commit.
- Every field serves a REAL DB value; where no real source exists the field
  is null (`confidence`, `patient`, `revenue_impact`) or a documented static
  placeholder (`drg: "—"`). Never reintroduce synthesized per-case fake data.
- The correctness gate is `./mvnw test` (requires imed-mock-api on :8003).
- **Swagger is NOT a fourth mirror.** The `@Operation`/`@ExampleObject`
  annotations on the controllers feed a local-dev try-it-out console; they are
  descriptive, hand-trimmed, and nothing asserts them. The same-commit sync
  obligation stays `docs/api-contract.md` + `docs/types.ts` +
  `CasesApiIntegrationTest`. Only **adding or removing an endpoint** obliges
  you to touch the annotations — `OpenApiDocsTest` enforces that much.

## Layout conventions

- Layers: `web/` (controllers) → `service/` (logic) → `repo/` (ALL SQL), plus
  `client/` (HTTP to the hospital iMed API — `ImedApiClient`: write-back on
  approve/reopen, and the read/sync GETs the `SyncService` pulls case data with).
- Many repo/service methods still carry comments naming their Python source
  line (`// views.py:117`) — provenance for archaeology, not a constraint.
- Responses are `LinkedHashMap<String,Object>` — stable key order and
  absent-vs-null stay one-line decisions per field. `service/Py.java` keeps
  the ported or-falsiness/slice helpers.
- Single-instance concurrency: one write `ReentrantLock` (`WriteGate`) + an
  in-process cases cache (`CasesCache`), invalidated after approve/reopen/
  reset — NOT after codes/draft saves. Never scale past one instance.
- **Writes are two-phase**: our DB transaction commits first, then the queued
  hospital calls run (`ApprovalService` → `ImedApiClient`), still inside the
  write lock — the Flask reference's two-commit order. A hospital-call
  failure 500s with our side committed; approve/reopen are idempotent on both
  sides, so re-doing the action heals.

## Progress

Milestones (git log --oneline reads as this sequence):

- ✅ **M0** skeleton, health endpoints, local PG seeding
- ✅ **M1** DeterministicFakes port + golden parity test
- ✅ **M2** read endpoints, full parity with Flask
- ✅ **M3** working-state writes (PUT codes/draft)
- ✅ **M4** approve + reopen, full write parity
- ✅ **M5** demo reset
- ✅ **M6** CORS, Dockerfile, deploy docs — all parity gates green
- ✅ **Fake-data removal (2026-07-22):** dropped `DeterministicFakes`;
  `confidence`/`patient`/`hn`/`created_at`/`updated_at`/`revenue_impact`/
  `coder` serve real DB values (null where none exists). Python parity
  scripts deleted; `CasesApiIntegrationTest` is the gate.
- ✅ **iMed split + contract ownership + Python removal (2026-07-22):**
  hospital side extracted to sibling repo `../imed-mock-api` (own `imed`
  database; the medcode DB has no imed schema anymore). Approval results go
  over HTTP (`client/ImedApiClient`, `IMED_API_BASE`). Seeding is committed
  `db/seed.sql.gz` dumps restored with plain psql — Python and `.venv` fully
  gone from both repos. URLs cleaned (`GET /api/cases`, `GET
  /api/cases/{id}` — no `.json` suffix). Backend now owns the API contract:
  `docs/api-contract.md` + `docs/types.ts`.
- ✅ **Swagger UI (2026-07-22):** springdoc 3.0.3 (the Boot 4 line; Boot's BOM
  doesn't manage it, so the version is pinned in `pom.xml`). Scope was chosen
  deliberately: a **try-it-out console for manual poking, local dev only** —
  not a codegen-grade spec. `SWAGGER_ENABLED` defaults true in
  `application.yml` and is forced `false` by `ENV` in the `Dockerfile`, so
  containers are off by construction (the API has no auth and
  `POST /api/demo/reset` is a bulk write). Metadata in `config/OpenApiConfig`.
- ✅ **Sync — inbound hospital pull (2026-07-23):** the read direction of the
  iMed integration. `POST /api/sync` (bulk) + `POST /api/cases/{id}/sync`
  (one) fetch case data from the hospital and load it into medcode. Ported
  from the retired `sync/sync.py`, but reshaped **non-destructive**: new case →
  import, existing OPEN case → refresh hospital-sourced rows only, finalized
  case → **skipped** (coder work — `coder_assigned` codes, edits/drafts,
  `case_status`, history — is never clobbered; a `case_synced` row is only
  appended). Idempotent, so re-running is safe. New code: `client/ImedApiClient`
  GET methods, `service/SyncService` + `service/SyncRules` (pure [POC] derive
  rules), `repo/SyncRepository`, `web/SyncController`. Reads the hospital only
  (no write-back). Runs under the `WriteGate` lock; invalidates `CasesCache`.
  Limitation: the hospital list has no "changed since" filter, so the fetch
  pulls the full list (writes are selective) — a future hospital-side add.
- ⬜ **M7 — cutover (NOT done, reshaped):** stand up prod (GCP, three
  containers), rerun both repos' test suites there, and build the NEW
  frontend against `docs/types.ts`. The old frontend/Flask pair just keeps
  running untouched until then.

Deploy direction (decided 2026-07-21, updated 2026-07-22): **GCP, three
containers** — medcode-api, imed-mock-api (until the hospital provides the
real iMed API; swapping is an `IMED_API_BASE` change), and one stock
`postgres:18` hosting both databases. Exact GCP service not chosen yet. Must
run a single medcode-api instance (`max-instances=1` on Cloud Run).

**Update this section when a milestone or significant decision lands.**

## Gotchas still live

- `./mvnw test` needs BOTH seeded databases AND imed-mock-api running on
  :8003 (`IMED_API_BASE`) — approve/reopen make real hospital calls.
- Timestamps/JSONB always come back as raw strings: `::text` casts +
  `getString`; never let JDBC parse them into objects.
- Never `ORDER BY` a PG ENUM column bare — the `CASE` expressions in the
  repo SQL define the intended order.
- JDBC URL needs `stringtype=unspecified` (writes into ENUM/JSONB columns)
  and `binaryTransfer=false`.
- Response-shape changes must update `docs/api-contract.md` + `docs/types.ts`
  and pass `CasesApiIntegrationTest`.
- The seed dumps are the frozen demo baseline — regenerating them requires
  the retired POC pipeline; treat `db/seed.sql.gz` (both repos) as data, not
  build output.

## Open tasks

- **Frontend rewrite** against `docs/types.ts` — separate project, not
  started, out of scope for this repo.
- **M7 cutover** (above).

## Full history

- Complete migration plan (context, file mapping, gotchas):
  `~/.claude-work/plans/what-is-current-backend-refactored-gosling.md`
- iMed split + contract-ownership plan:
  `~/.claude/plans/lets-split-repo-first-shimmying-ripple.md`
