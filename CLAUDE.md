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

**Domain vocabulary: `docs/medical-glossary.md`.** Plain-language meanings of
every medical term this project touches — visit/OPD/IPD/HN, ICD-10 vs ICD-9 and
the code roles, the note sections, lab/drug/imaging order names, the Thai
coverage schemes and departments, the clinical shorthand inside note text, and
(important) which "clinical-looking" fields are really our own [POC] rules
(disease group, severity, completeness). It also carries the **ICD-10-TM
Standard Coding Guidelines** our coders are judged against — one principal
diagnosis only, comorbidity vs complication, "a lab result is never a
diagnosis", TTM U50–U77 and the 7-digit Thai procedure codes — with sources.
Read it before reasoning about hospital data or writing anything user-facing
about the domain; extend it when new terms appear in the data.

## The golden rule (rewritten 2026-07-22 — the Flask-clone era is over)

**This backend owns the API contract.** The old React frontend is retired; its
replacement — the sibling repo `../audit-chart-frontend` — is built against
`docs/api-contract.md` + `docs/types.ts` and is now LIVE against this backend
(see the 2026-07-27 entry in Progress). Consequences:

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
- ✅ **Admin auth + account management (2026-07-24):** login wall around the
  **admin surface only** — the case/approve/sync endpoints stay public
  (unchanged, tests untouched). Per-account BCrypt passwords (new `password_hash`
  column), roles just `coder`/`admin` (the frontend's "Senior Coder" was a
  mistake; "SuperAdmin" = the `admin` role), opaque **Bearer tokens** stored
  server-side in the existing `auth_sessions` table (`session_id` = sha256 of the
  token; `SESSION_TTL_DAYS` default 7). New endpoints: `POST /api/auth/login`,
  `POST /api/auth/logout`, `GET /api/auth/me`, and admin-guarded
  `GET/POST /api/admin/accounts`, `PUT /api/admin/accounts/{id}`,
  `PUT …/{id}/status`, `DELETE …/{id}`, `GET /api/admin/dashboard`. Key
  choices: **`spring-security-crypto` only** (BCrypt), NOT
  `spring-boot-starter-security` — the starter would auto-lock every endpoint;
  enforcement is a hand-written `AuthInterceptor` scoped to `/api/admin/**` +
  `/api/auth/{me,logout}`. No migration tool exists, so a startup
  `ApplicationRunner` (`config/SchemaBootstrap`) idempotently adds `password_hash`
  and seeds a bootstrap admin from `ADMIN_BOOTSTRAP_EMAIL`/`_PASSWORD` (default
  `admin@medcodeai.demo` / `admin1234` — WARNs on the default). Delete is
  audit-safe: an account referenced by coding history → `409` (deactivate
  instead). New code: `web/{AuthController,AdminController,AuthInterceptor}`,
  `service/{AuthService,AccountService}`, `repo/{UsersRepository,
  AuthSessionRepository}`, `config/{AuthConfig,WebConfig,SchemaBootstrap}`. Test:
  `web/AdminApiIntegrationTest`. This **supersedes** the old
  shared-coder-password idea (per-account passwords won).
  **Prod-hardening added same day:** `POST /api/demo/reset` is now gated by
  `DEMO_TOOLS_ENABLED` (default true locally, forced `false` in the Dockerfile
  like `SWAGGER_ENABLED` — returns `404` when off); and login has an in-memory
  brute-force lockout (`service/LoginRateLimiter`, `LOGIN_MAX_ATTEMPTS`/
  `LOGIN_LOCKOUT_SECONDS`, keyed by email, single-instance) that 429s past the
  limit. Deferred still: coder-facing login + stamping the authenticated coder
  into approvals (wait for the coder frontend); the broader prod checklist
  (gate case reads, HTTPS/SSO/private network) is discussed but not built.

- ✅ **Real iMed write contract — diff-based write-back (2026-07-24):** the
  hospital delivered its real API spec ("iMed Diagnosis and Medical Discharge
  API" PDF: `POST /api/v1/diagnosis`, `PUT /api/v1/diagnosis/{visit_id}`,
  `DELETE …/icd10|icd9/{object_id}`, Bearer auth, request_id dedup,
  STATUS_SUCCESS/BUSINESS_ERROR envelopes, 409 duplicate rule). Supersedes
  the invented coding-result contract — which was DELETED on both sides, not
  kept in parallel (decision). imed-mock-api now mocks the real contract
  field-for-field (+ our proposed `PUT/DELETE /api/v1/coding-status/{visit_id}`
  extension, backed by the coding-status table the hospital agreed to add;
  DELETE = cancel flow via `is_cancelled`, reads filter cancelled rows). This
  side: `client/ImedApiClient` reworked (Bearer `IMED_API_TOKEN`, /api/v1
  calls), new `service/ImedWritebackService` implements the decided **diff
  strategy** — finalized codes vs live hospital rows → cancel removed / PUT
  changed / POST new (order matters: cancel→update→create avoids the 409),
  journaled with before-images in `imed_write_ops` (SchemaBootstrap +
  `db/migrations/0002_imed_write_ops.sql`); reopen replays the journal in
  reverse against live state (created→cancel, updated→restore,
  cancelled→re-create with new ids — iMed has no un-cancel) and clears it.
  Hospital writes still ONLY at approve/reopen (decision), still two-phase
  after our commit; healing = re-diff against live state, not request replay.
  `stats.mcai_code_rows` now counts diff writes (key kept for compat).
  Placeholders pending hospital master data: `fix_operation_type_id`
  GENERAL_OPERATION, discharge-object ids (open question 3 — the discharge
  coupling — is the big unknown). Field mapping + 10 open hospital questions:
  `docs/imed-integration.md`. Known gap: a crash between POST and journaling
  its created ids leaves rows reopen can't attribute (approve re-diff heals).
- ✅ **Case-surface auth + token actor stamping (2026-07-25, Phase 3):** the
  AuthInterceptor now also guards /api/cases/**, /api/sync and
  /api/demo/reset — any valid token (either role); 401 otherwise. Approve and
  reopen take their acting coder from the authenticated principal's email
  (`ApprovalService.approve(ids, userId, coder)`; body `coder` accepted but
  IGNORED). Public remains: login, /api/health(z), Swagger. This supersedes
  the earlier "auth is admin-only, never gate case routes" gotcha — reversed
  deliberately now that the coder frontend logs in. Contract docs + both
  integration tests updated (tests authenticate as the bootstrap admin; the
  history-guard test now creates a real coder account since body-coder
  auto-creation is gone).
- ✅ **New frontend wired to this backend (2026-07-27):** the replacement UI
  lives in the sibling repo `../audit-chart-frontend` (React + Vite + axios,
  `VITE_API_BASE_URL=http://localhost:8001/api` — the base URL already
  includes `/api`). It calls 18 of our 20 endpoints for real: auth
  (login/logout/me), both case reads, all four case writes (approve, reopen,
  PUT codes, PUT draft), the whole admin surface (accounts CRUD + status +
  dashboard), and demo reset. Its `lib/axios.ts` attaches
  `Authorization: Bearer <token>` from `localStorage` on every request and, on
  any 401 outside the login form, clears the token and redirects to `/login` —
  matching the Phase 3 auth model. It sends no `coder` name on approve/reopen
  and relies on our token stamping. NOT wired: `POST /api/sync` and
  `POST /api/cases/{id}/sync` — the UI's Sync button is still a 2.2s fake
  timer (`SyncProvider.tsx`), so nothing triggers a hospital pull from the
  browser yet. Its Analytics, Agent-chat and Training/knowledge-base pages are
  deliberate mocks/stubs (`USE_MOCK = true` + TODOs) — we have no endpoints
  behind them and none are planned yet, so DON'T read those TODO paths
  (`/analytics`, `/agent/*`, `/admin/knowledge/*`) as a contract we owe.
  Behavior worth knowing: their code/draft/approve writes are best-effort —
  failures are swallowed and the browser keeps its own `localStorage` copy, so
  a rejected write still looks saved on screen.
- ✅ **ICD catalog split into two tables (2026-07-28):** the single `icd_codes`
  table (discriminated by the `code_system_t` enum) became **`icd_10` + `icd_9`**,
  because the two systems are expected to DIVERGE — ICD-9-CM procedure codes and
  ICD-10 diagnosis codes want different columns, and one shared table can only
  grow columns that are null for half its rows. Consequences: `case_codes` now
  carries **two nullable FK columns** (`icd_10_id`, `icd_9_id`) with
  `case_codes_one_catalog_ck` pinning exactly one per row — so a catalog id is
  meaningless without its system, and the two always travel together
  (`CodingRepository.insertCaseCode(caseId, codeSystem, id, …)`,
  `SyncRepository.insertImportedCode(caseId, codeSystem, id, …)`). The old
  `icd_code_id` values were PRESERVED as the new primary keys (both systems drew
  from one sequence → disjoint id spaces → unambiguous backfill, and the split
  is reversible). Reads use `LEFT JOIN` to both tables + `COALESCE`, with a
  `WHERE … IS NOT NULL` guard preserving the old INNER JOIN semantics. New
  `repo/IcdSystem` enum is the one place that maps a system label to a table and
  is deliberately **strict** — an unknown label throws, matching the enum column's
  old type-cast rejection. **The API contract did NOT change** (`code` + `system`
  chips are byte-identical; verified by checksumming every case's resolved
  code/system/description before and after), so `docs/api-contract.md` and
  `docs/types.ts` were untouched. `code_system_t` is left defined but unused —
  the discriminator is now which column is populated.
- ⬜ **M7 — cutover (NOT done, reshaped):** stand up prod (GCP, three
  containers) and rerun both repos' test suites there. The frontend half of
  this milestone is done (above); what remains is prod hosting plus pointing
  the frontend's `VITE_API_BASE_URL` at it. The old frontend/Flask pair just
  keeps running untouched until then.

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
- The sibling `imed` database keeps every table in a schema named **`imed`**,
  not `public` (a leftover from the pre-split single-database era, frozen into
  its dump). Doesn't affect us — we only reach it over HTTP — but two things
  follow for M7: the hospital-side SQL must stay schema-qualified, and
  provisioning needs `GRANT USAGE ON SCHEMA imed` for any non-owner app role
  or it fails with "permission denied for schema imed". Details in
  `../imed-mock-api/README.md`.
- The **ICD catalog split is also outside the seed dump** (same trap as auth):
  `db/seed.sql.gz` still ships the pre-split single `icd_codes` table, so a fresh
  re-seed resurrects it and `config/SchemaBootstrap.splitIcdCatalog()` re-applies
  the split on the next boot (idempotent, mirrored in
  `db/migrations/0003_split_icd_codes.sql`). Don't "fix" a re-appeared
  `icd_codes` by editing the dump — just boot the app. Note the runner returns
  early once a bootstrap admin exists, so **any new DDL must go ABOVE that
  return**, as the split does.
- Auth schema lives OUTSIDE the seed dump: `config/SchemaBootstrap` adds the
  `users.password_hash` column + the bootstrap admin at every startup
  (idempotent). So a fresh re-seed drops them and the next boot restores them —
  don't "fix" a missing `password_hash` by editing the dump. `@SpringBootTest`
  runs the runner too, so the test DB self-heals.
- Auth covers the WHOLE case surface since 2026-07-25 (Phase 3 — the earlier
  "admin-only, never gate case routes" scope is OVER): the interceptor guards
  /api/cases/**, /api/sync and /api/demo/reset (any valid token), and
  approve/reopen stamp the logged-in account (body `coder` ignored). Only
  login, health, and Swagger stay public. Adding
  `spring-boot-starter-security` is still the trap the memory warns about — we
  use `spring-security-crypto` (BCrypt) + a `HandlerInterceptor` instead.

## Open tasks

- **Frontend** (`../audit-chart-frontend`) — built and live against this
  backend; the repo itself stays out of scope here. Two loose ends on OUR
  side of the seam: nothing in the UI calls `/api/sync` yet, and the three
  mocked pages (Analytics, Agent, Training) have no endpoints behind them —
  neither is a promise we've made.
- **M7 cutover** (above).

## Full history

- Complete migration plan (context, file mapping, gotchas):
  `~/.claude-work/plans/what-is-current-backend-refactored-gosling.md`
- iMed split + contract-ownership plan:
  `~/.claude/plans/lets-split-repo-first-shimmying-ripple.md`
