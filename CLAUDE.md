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
  includes `/api`). It calls nearly the whole surface for real: auth
  (login/logout/me), both case reads, all four case writes (approve, reopen,
  PUT codes, PUT draft), the whole admin surface (accounts CRUD + status +
  dashboard), and demo reset. Its `lib/axios.ts` attaches
  `Authorization: Bearer <token>` from `localStorage` on every request and, on
  any 401 outside the login form, clears the token and redirects to `/login` —
  matching the Phase 3 auth model. It sends no `coder` name on approve/reopen
  and relies on our token stamping.
  **Wiring status (re-checked 2026-07-29 — the earlier "18 of 20 / Sync is a
  fake timer" note was already stale when written down):** bulk sync IS wired
  (`SyncProvider.runSync` → `syncFromHospital()` → `POST /api/sync`, triggered
  from `CasesLayout.tsx`, with `CasesPage` refetching on `syncVersion`); the
  **Training page is LIVE** against all seven `/api/admin/knowledge/**` routes
  (`trainingService.ts`, `sync-codes` included); and `suggest-codes` +
  `icd-codes` are called from the case detail pages and the Add-code modal.
  Still NOT wired: **`POST /api/cases/{id}/sync`** (per-case) has no caller.
  (**Superseded 2026-08-07:** the old "Analytics + Agent-chat remain
  `USE_MOCK = true`, no endpoints behind them and none planned" note is DEAD —
  both pages are live now. `/api/agent/chat` landed with the RAG work, and
  `GET /api/analytics` landed 2026-08-07; `USE_MOCK` is gone from
  `analyticsService.ts` and `agentService.ts`.)
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
- ✅ **Catalog-search repair + contract drift closed (2026-07-29):** merging
  `origin/main` after the ICD split was textually clean but semantically broken.
  The incoming `GET /api/icd-codes` typeahead (and its frontend client, the
  Add-code modal's `CodeSearchField`) queried `FROM icd_codes` — the table
  `SchemaBootstrap` now DROPS. Nothing caught it: no test covered the endpoint,
  and it compiled fine because the table name lives in a SQL string.
  `IcdCatalogRepository.search()` now reads both tables — one table when
  `system` is given, `UNION ALL` inside a subquery when it isn't (so ranking and
  `LIMIT` apply across the combined set), via a private `matchingRows(IcdSystem)`
  fragment builder. The controller already 400s a blank `q` or an unknown
  `system`, so `IcdSystem.of()` can't throw there.
  Then the wider problem behind it: **`OpenApiDocsTest` only checked one direction**
  — that its hand-kept `EXPECTED_PATHS` were present — so any endpoint added
  without touching the list shipped undocumented. `icd-codes`,
  `cases/{id}/suggest-codes` and `admin/knowledge/sync-codes` had all drifted
  that way. The test now asserts **both** directions and all three are
  documented in `docs/api-contract.md` + `docs/types.ts`.
- ✅ **ICD-9 operation time window, end-to-end (2026-07-30):** an ICD-9 code is
  a procedure, and a procedure happens over a time window — the hospital records
  it on BOTH surfaces (extract `startdatetime`/`enddatetime`; write API
  `date_in`/`time_in`/`date_out`/`time_out`, real PDF fields) and we were the
  only link dropping it. Now: `case_codes.operation_start/_end` (text, nullable,
  ICD-9 rows only — guarded in both insert paths; SchemaBootstrap +
  `db/migrations/0004`), sync imports the extract times (normalized via
  `SyncRules.parseDt`), detail `codes[]` serves them (`operation_start/_end`,
  null on ICD-10), CodeEdit rows carry them into approve (datetime-local
  `YYYY-MM-DDTHH:MM` accepted, garbage → null), and the write-back diff sends
  them split into the four iMed fields — same never-blank rule as names, window
  change = PUT, reopen restores from the journal before-image. Frontend
  (`../audit-chart-frontend`): Add-code ICD-9 box + both Edit modals get
  datetime-local inputs **pre-filled with "now"** (decision: a procedure must
  have times; default-now + coder edits, not a hard 400 — hospital rows with
  blank times stay valid), cards show a Clock line, detail seeding keeps the
  hospital times. Two adjacent bugs found and fixed: (1) sync 500'd on any
  case whose hospital diagnosis has a null `diagnosistype` (Java `Map.of` NPEs
  on null keys where Python's `.get(None)` didn't — KNOWN_CASE_ID could never
  sync); (2) approve 500'd on the UI's verbose `type` labels ("ICD-9 Primary
  Diagnosis", "Comorbidities") via strict `IcdSystem.of` — materialize now
  mirrors the frontend's own `/icd[- ]?9|pcs/i` rule ("…comorbid…" → secondary),
  and the frontend's ICD-9 comorbidity label became "ICD-9 Comorbidity" (the
  bare legacy "Comorbidities" reads as ICD-10 on both sides — old saved rows
  keep that consistently). Hospital data itself can be dirty (a seeded overnight
  surgery ends "before" it starts) — we store/display verbatim, no end>start
  validation. imed-mock-api needed NO change (it already persisted the four
  fields). Tests: sync-import + edit→approve→reopen round trips in
  `CasesApiIntegrationTest` (the second also covers the verbose-label fix).
- ✅ **Hospital-UI elements: operation type + vital signs (2026-07-30):** the
  hospital wants our app to show the same fields as its own coder UI (screenshots
  in the 2026-07-30 session; gap analysis → memory + open question 11). The two
  gaps closeable without hospital help, both end-to-end: (1) **operation type**
  — the extract's `operationtype` on ICD-9 procedures ("OR Procedure" / "NON OR
  Procedure" / "OTH" / "GENERAL_OPERATION"), previously read by sync only as a
  surgery-order filter and discarded. Now: `case_codes.operation_type` (text,
  ICD-9 only, guarded in both insert paths; SchemaBootstrap + migration 0005),
  sync imports it, detail `codes[]` serves it, CodeEdit `operation_type` carries
  it through approve, and the write-back POST sends it as
  `fix_operation_type_id` when present (else the GENERAL_OPERATION placeholder,
  unchanged; PUT/diff still ignore it — settable on create only). Reopen
  re-creates carry the hospital's original value via the journal before-image.
  (2) **vital signs** — `medhack_vitalsign` existed in the imed DB and the mock
  already served `GET /api/cases/{tn}/vital-signs`; nothing on our side read it.
  Now: `case_vitals` table (hospital-sourced, refresh = delete+reinsert, blanks
  → null), synced per case, served as detail `vitals[]` (chronological), sync
  stats gains `vitals`. Frontend (`../audit-chart-frontend`): ICD-9 cards show
  an operation-type chip, Add-code ICD-9 box + both Edit modals get a Type
  dropdown (`OPERATION_TYPES` in `utils/operationTime.ts`, default "OR
  Procedure", unknown hospital values still render + round-trip), and a
  `VitalsStrip` table (Time | BT | BP | PR | O2Sat | Wt | Ht, hospital-style)
  sits above the report text on all three detail pages. **Round 2 (same
  day):** the ICD-10 type dropdown grew the hospital's other two diagnosis
  kinds — "ICD-10 Other" / "ICD-10 External Cause" labels; materialize now
  reads "…external…" → `external_cause` and "…other…" → `other` (both roles,
  sync mapping and write-back diagnosis types existed all along), and detail
  seeding became role-aware (`codeTypeFromRole`) so an imported external-cause
  diagnosis opens the Edit dialog on the right type instead of collapsing to
  first-ICD-10-= principal. Plus a per-code **Note** (the hospital UI's Note
  column) — deliberately INTERNAL-ONLY: a `note` field riding the CodeEdit
  verbatim round-trip (stored + echoed, never materialized, never sent to
  iMed — its write API has no note field; labeled "(internal)" in the UI).
  **Round 3 (same day):** labs render as the hospital-style results table
  (`global/LabResults.tsx` — grouped by panel, `item : value unit`, report
  datetime in the header), fed by the lab order rows' detail JSON
  (panelname/itemname/itemvalue/itemuom) that sync always stored;
  `ReportOrders` dropped its generic "Lab" category (and filters lab rows
  from its empty-guard). NO abnormal-value highlighting on purpose — the
  extract has no reference ranges (open question 14). The rest of the
  hospital's UI fields (doctor, clinic, chronic flag, recorder, WHO/TM/CM
  edition, Extension Code, lab ranges) are NOT in the extract — blocked on
  the hospital, tracked as `docs/imed-integration.md` open questions 11–14;
  the user chose NOT to contact the hospital for now, so don't draft
  outreach unprompted.
- ✅ **Hospital-style panel view of the case detail (2026-07-31):** the case
  detail's report side can now render as the SAME six-panel layout the
  hospital's own coder screen shows — CC,PI,PE (vitals table + note text) ·
  Past history (allergies in red) · Lab/X-ray · Diagnosis/Procedure (codes
  with roles, หัตถการ list with op type/window, Assessment text) · Order
  Entry (CPOE, name + qty) · Investigations finding · Management/Suggestion —
  with a persisted toggle back to the chronological document view (which
  keeps day-by-day order; unmapped fieldnames land in a "Progress / other
  notes" panel so nothing is dropped). Frontend: `global/HospitalPanels.tsx`
  + wiring in all three detail pages (`../audit-chart-frontend`). Backend
  enabler — and a latent-bug fix: detail `orders[]` never served the stored
  `order_detail` JSONB, though the frontend's lab table and order chips had
  read `o.detail.*` all along (they silently degraded to name-only rows with
  "—" values). Now each order row carries `detail` (raw hospital row, parsed
  from JSONB text in the service) + a new `orderCounts` map (true per-category
  totals), and the orders cap became **50 rows per category** (old global
  LIMIT 150 let 400-lab IPD cases starve medicine rows out entirely — the
  CPOE/med panels would have been empty exactly on the big cases). Contract +
  docs/types.ts updated; `caseDetailOrdersCarryDetailJsonAndTrueCounts` is
  the test (fun fact it caught: medicine quantity can be negative — we read
  that as a return/credit row and display it verbatim; recorded as open
  question 15 in `docs/imed-integration.md`). Still blocked on hospital
  data, unchanged: lab normal ranges (no abnormal-value highlighting, Q14)
  and doctor/recorder names (MD field shows "—", Q11).
- ✅ **Frontend WCAG 2.2 AA pass (2026-07-31):** three commits in
  `../audit-chart-frontend` (67ab714 / ac8e9da / fb4b76d+69a496d) after a full
  audit found ~20+ AA failures. Phase 1: shared `useModalA11y` (Escape, focus
  trap, focus restore) + `ModalShell` behind all 8 hand-rolled overlays, label
  wiring via a `Field` render-prop in the three code modals, aria-labels on
  every icon button/input, live-region toasts + alert banners, global
  `:focus-visible` ring, **inert hidden tab panels** (keyboard users could
  approve invisible cases), keyboard-reachable PDF dropzone. Phase 2: the ICD
  typeahead is a real ARIA combobox (arrows/Enter/double-Escape), case tabs are
  a real tablist, per-route `document.title`, `<html lang>` follows the EN/TH
  toggle, skip links, table scope/captions; `eslint-plugin-jsx-a11y` enforced
  as **errors** (deliberate mouse-only conveniences carry inline disables
  naming the accessible path). Phase 3 (user pre-approved look changes):
  contrast tokens fixed — light-rose muted 0.50→0.70 and accent `#C9748A`→
  `#A34D66` (accentRgb follows), dark-rose muted →0.70, mono muted →0.60;
  all ≤11px text bumped to 12px (isolated commit 69a496d, revert if something
  wraps); 24px touch targets; `prefers-reduced-motion`; real `<title>`.
  Still manual-only: VoiceOver/keyboard walkthrough scripts + a visual pass of
  the 4 themes (in the plan file `~/.claude/plans/glittery-forging-waffle.md`);
  keyboard drag-reorder of code priority is the one tracked follow-up. Lint's
  7 remaining errors are PRE-EXISTING react-hooks/react-refresh findings,
  untouched deliberately.
- ✅ **Completeness rule = "arrived already coded" (2026-08-05):** the third
  incarnation of the [POC] completeness rule. A case is now **complete** when
  the hospital data at sync time already carried BOTH code systems — ≥1 ICD-10
  diagnosis and ≥1 ICD-9 procedure; anything less is **incomplete** (missing
  labels `icd10` / `icd9`). Replaces the documentation-sections rule
  (chief/exam/assessment, admission note/clinical summary) entirely — same
  rule for OPD and IPD. `SyncRules.missingCodes(hasIcd10, hasIcd9)` replaced
  `missingSections`; `SyncService.writeCase` derives the booleans from the
  hospital diagnosis/procedure rows (truthy `icd` only — same filter as code
  import); `CasesViewService.MISSING_LABEL` gained the two new keys and KEEPS
  the legacy ones, because stored `missing_detail` values only recompute on
  the next sync (finalized cases are skipped by sync, so theirs stay frozen
  under the old rule until reset/re-import). API shape unchanged
  (`completeness_status`, `missing_detail`, `missing` all as before) — only
  the semantics moved; glossary §11 updated, contract/types untouched.
- ✅ **Demo reset keeps accounts (2026-08-05):** `POST /api/demo/reset` no
  longer prunes accounts created after the snapshot, and no longer reverts
  baseline accounts to their snapshotted row — the users table is left as-is
  (everyone stays logged in). The one exception: a baseline account deleted
  since the snapshot is re-inserted (`ON CONFLICT DO NOTHING`), because
  restored audit rows FK to it (`coding_history.user_id`,
  `case_codes.assigned_by`, `knowledge_base.taught_by`).
  `DemoBaselineService.reset()` + contract updated.
- ✅ **Time-windowed sync (2026-08-05):** coders pick a visit-date period and
  pull only those cases, instead of always fetching the hospital's full list.
  `POST /api/sync` takes an optional `{from, to}` body (`YYYY-MM-DD` or
  datetime, inclusive, either side optional; malformed → 400; response echoes
  a `window` key only when windowed). The filter runs HOSPITAL-side:
  imed-mock's `GET /api/cases` gained `from`/`to` on the **visit datetime** —
  `admissiondatetime` when filled, else the **YYMMDDHHMMSS encoded at
  positions 4–15 of the transaction number** (verified identical to the
  notes' recorddatetime on all 21 seed visits; `admissiondatetime` is blank
  throughout the seed) — plus a `changed_since` filter backed by a new
  `updated_at` text column on the two code tables (stamped by every /api/v1
  create/update/cancel; visit-level max, floored at the visit datetime; seed
  rows stay NULL; mock migration 0003 + baseline-schema ALTER so demo reset's
  positional INSERT…SELECT * survives). medcode does NOT expose
  `changed_since` yet — it's reserved for the deferred auto-sync; both
  filters together are hospital open question 16 in `docs/imed-integration.md`.
  Frontend: the header Sync button now opens `SyncDialog` (Today / Last 7
  days / All presets + date inputs, defaults to today) → `runSync({from,to})`.
  Tests: mock list-filter + changed_since tests (16/16 green);
  `bulkSyncAcceptsAVisitDatetimeWindow` in `CasesApiIntegrationTest`.
  **Found while testing, NOT fixed here: 13 pre-existing
  CasesApiIntegrationTest failures** — the suite's KNOWN_CASE_ID/
  APPROVABLE_CASE_ID are April-2026 TNs from the retired dataset, but the DB
  now holds the curated July demo dataset (empty-start-state era), so every
  test needing an approved/known case fails regardless of this change
  (verified identical red set on a clean checkout). The suite needs re-basing
  onto the new demo data.
- ✅ **Analytics live + local `dev_all.sh` gains RAG (2026-08-07):** two
  things landed the same day. (1) **`GET /api/analytics`** arrived from remote
  (`AnalyticsController` / `AnalyticsService` / `AnalyticsRepository`, plus a
  real discharge status on approve) and the frontend's Analytics page dropped
  its mock fallback — so **Analytics and Agent chat are both LIVE now**, killing
  the old "no endpoints behind those two and none planned" note in two places
  above. That commit **forgot `OpenApiDocsTest.EXPECTED_PATHS`** and so shipped
  the build red on the reverse assertion (`docs/api-contract.md` + `docs/types.ts`
  were done); adding `/api/analytics` to the list was the whole fix — exactly the
  drift that assertion exists to catch, working as designed. (2) **`scripts/
  dev_all.sh` now starts RAG too** (`:8000`, via `RAG/.venv/bin/python run.py`,
  `RAG_DIR` overridable), so one command brings up all four repos. RAG is treated
  as **optional-by-design** — a missing `.venv` or a failed start only WARNs and
  the stack continues, because everything except AI suggestions / Agent / Training
  works without it; `--no-rag` skips it deliberately. Teardown sweeps `:8000`
  because `uvicorn --reload` runs a child worker the parent PID doesn't cover.
  **`dev_all.sh` is deliberately NOT in git** (`.git/info/exclude`) — the team
  isn't all on macOS and `scripts/*.sh` is bash + `lsof` + `brew`, so the
  four-terminal path in `RUN-ALL.md` §5 stays the one documented route. It was
  briefly tracked on 2026-08-07 and untracked again the same day; don't re-add
  it, and don't reference it from tracked docs. (The tracked `dev.sh` is just as
  mac-bound — both are now labelled macOS/Linux-only, with Windows pointed at the
  manual path.)
- ✅ **Selection-first code review (2026-08-07):** the coder flow inverted. AI /
  hospital suggestions used to arrive as "everything is in, delete what's
  wrong"; now **nothing is pre-ticked** and the coder ticks the codes that
  belong on the case, then approves. The pick rides in the codeEdits payload as
  a `selected` boolean, so it is durable (server copy) and survives reload,
  and `ApprovalService.materializeCodeEdits` skips rows with an explicit
  `selected: false` — an ABSENT key still approves, so payloads saved before
  this flow behave exactly as they did. Unticked codes are NOT deleted: they
  stay in the working state, visible and re-tickable, and never reach iMed
  (verified live: a 3-row payload with one unticked code wrote 2 coder rows and
  the hospital got only those two). One guard: an all-unticked payload falls
  back to re-confirming the imported principal, the same path as "no saved
  edits", because that shape means nobody reviewed the case (the UI saves RAG
  suggestions as soon as a case is opened, and the list page can bulk-approve).
  Frontend (`../audit-chart-frontend`): checkbox per code card (the diagnosis
  title is its label, so the whole title is a target), ticked = accent fill +
  ring / unticked recedes at 0.78 opacity, per-column tri-state "Select all"
  + Clear (indeterminate = "mixed", same control the case list already uses),
  the column badge counts `picked/total`, and Approve says "Approve (n)" and is
  DISABLED at zero with the reason in its tooltip. Manual codes stay pre-ticked
  (typing a code is picking it), "???" placeholders can't be ticked until
  resolved, and delete/edit/drag are unchanged. New `utils/codeSelection.ts`
  holds the rules incl. the legacy-payload migration (no `selected` key
  anywhere → keep the coder's own codes ticked, everything else waits).
  Contract + `docs/types.ts` + Swagger text updated; the new
  `unselectedCodeEditsAreKeptButNotApproved` test sits in
  `CasesApiIntegrationTest` but CANNOT pass until the suite is re-based onto
  the July demo dataset (its APPROVABLE_CASE_ID is a retired April TN — the
  known 13-failure problem, unrelated to this change).
- ✅ **Coding status on the hospital visit row (2026-08-07):** the hospital now
  has an "approved" flag of its own — `imed.medhack_patient.coding_status`
  (`'approved'` / NULL), the twin of our `cases.case_status`. It replaces the
  old marker, which **overwrote `medhack_patient.dischargestatus`** — the
  DOCTOR's clinical outcome ("Improved", …), never ours to write; the mock's
  /api/v1 writes no longer touch that column, and the discharge status id we
  send (`"Coding Approved"`, still open question 3) now stays inside
  `doctor_discharge_opd/_ipd`. Set through a new optional **`coding_status`
  field on the EXISTING `POST`/`PUT /api/v1/diagnosis` envelope** — no new
  endpoint, and the status commits in the same hospital transaction as the
  codes. `"approved"` on approve, the reserved `"open"` on reopen (clears to
  NULL), absent = no change. `ImedWritebackService` puts it on the diff bodies
  it already sends and falls back to ONE body-less PUT when the diff had
  nothing to say (nothing changed, or only cancels — a DELETE carries no
  body); `DiffResult` is what carries "did a body go out" back from
  `diffKind`. Mock side: `SchemaBootstrap` + `db/migrations/0005` (with the
  `imed_baseline` mirror, or positional demo reset breaks), `updateCodingStatus`
  replacing `updatePatientDischargeStatus`, unknown status words → 400. Reads
  needed no change — `GET /api/cases` serves `p.*`. This **revives** the
  coding-status idea withdrawn 2026-08-02, but as a field on an existing route
  instead of a table + dedicated endpoint (a smaller ask of the hospital).
  Still OUR invention: hospital open question 17 in `docs/imed-integration.md`.
  Verified live end-to-end (approve → `approved`, reopen → NULL, and the
  no-diff approve still marks the visit with `mcai_code_rows: 0`); mock suite
  16/16 green. Our own API shape is unchanged, so `docs/api-contract.md` +
  `docs/types.ts` were untouched.
- ✅ **Codes grouped by ORIGIN; no % on hospital codes (2026-08-07):** a code
  column used to be one undifferentiated list, so a hospital-imported fact, a
  RAG guess and the coder's own typing looked identical — and every one of
  them wore a confidence %, because hospital rows were seeded `confidence:
  100` and the AI's real score sat in the same slot. Now each ICD column
  renders **labelled groups in a fixed order: Added by coder → From hospital
  record → Suggested by AI → Not documented** (the 4th holds the "???"
  placeholders, which are nobody's suggestion). The **% shows on AI rows
  ONLY** — a hospital code is already in the hospital's record and a typed
  code is the coder's own call, so neither has anything to be confident
  about — and the column header's average plus the case-list AI Confidence
  pill now average **AI rows only** (`avgAiConfidence`), so a case with no AI
  opinion shows no number instead of a meaningless 100%. Carried by a new
  `origin: "manual" | "hospital" | "ai"` field on **CodeEdit**, which needs
  ZERO backend code: `PUT /codes` reparses and re-serializes the whole body
  into JSONB with no field whitelist, so unknown keys round-trip verbatim
  (same free ride as `note`) — only `docs/api-contract.md` + `docs/types.ts`
  were touched here. Frontend (`../audit-chart-frontend`): new
  `utils/codeOrigin.ts` owns the vocabulary, the order and `originOf()`,
  whose **legacy fallback** reads pre-2026-08-07 payloads (no `origin`
  anywhere) as manual-flag → manual, `confidence === 100` → hospital, else
  AI; the three detail pages seed `origin` from the detail row's `source`
  (`imported_from_imed` → hospital, else manual), `suggestedToStored` stamps
  `ai`, and both Add-code paths stamp `manual`. Grouping replaces the old
  two-way manual/auto split in `CodesColumn`; drag-reorder still snaps back
  across a group line (grouping wins over free ordering), which is safe for
  approve because manual and hospital rows carry role-bearing type labels and
  so never steal the positional principal-diagnosis pick from a bare-labelled
  AI row. Also confirmed while doing this: the completeness rule the coders
  see IS "the hospital's own data arrived with both systems" — unchanged.
- ✅ **Agent chat streams + grounded code lookup (2026-08-15):** prep for the
  GPU-less prod host (decided: no API, no GPU, 15-30s answer budget — accuracy
  comes from retrieval, not model size). New `POST /api/agent/chat/stream` —
  same body as /chat, SSE passthrough of the RAG side's new `/chat/stream`
  (`meta` with contexts first, `delta` pieces, terminal `done`/`error`;
  mid-stream failures are events because headers are already out).
  `RagApiClient.streamChat` pipes bytes with per-chunk flush over a shared JDK
  HttpClient (HTTP/1.1 — same uvicorn h2c gotcha). RAG side (`../RAG`) also
  gained: exact-substring code lookup (codes named in the question fetch their
  literal chunks via Chroma `$contains`, ranked ahead of semantic hits, capped
  union of 8), `unverified_codes` on /chat responses (codes the answer cites
  that no retrieved chunk contains — the medical grounding guard), and
  `display_name` on every context (rename-following citation labels).
  Frontend streams with a blocking-endpoint fallback and renders the
  unverified-codes warning; dict mode caps answers at 224 tokens.
  Contract + types.ts + OpenApiDocsTest updated (test green). Deferred by
  choice: bge reranker (needs a ~1GB model download; flag off until wanted)
  and the prod model swap (host .env: 3B-class `OLLAMA_MODEL`, 8+ cores,
  32GB RAM — dev keeps Eir-8B unchanged).
- ✅ **All four repos dockerized + a compose stack (2026-08-17):** the whole
  system now runs as five containers. Shape decided deliberately: **four
  separate images, each built from its own repo's own Dockerfile**, plus ONE
  compose file that owns only the seam between them — it lives in a new fifth
  sibling folder `../medcode-stack/` (compose + Postgres init scripts +
  `.env.example` + README, no application code), so no repo becomes the hidden
  owner of the other three. One image per service, never a bundle: three
  runtimes, RAG must stay independently killable (it is optional-by-design), and
  Cloud Run wants one image per service anyway. New files: `Dockerfile` +
  `nginx.conf` in `../audit-chart-frontend`, `Dockerfile` in `../RAG`, a
  `.dockerignore` in all four repos (RAG's `.venv` alone is 1.3GB of build
  context). Key decisions and the traps they avoid:
  - **The frontend is nginx + the built SPA with `/api` proxied to
    `medcode-api`.** Vite inlines `VITE_API_BASE_URL` at BUILD time, so a baked
    hostname would mean one image per environment; building with the relative
    `/api` gives one image everywhere and same-origin requests, so CORS stops
    mattering. Two nginx defaults are load-bearing overrides:
    `proxy_read_timeout 600s` (AI suggestions/training legitimately run for
    minutes — the 60s default 504s them) and `client_max_body_size 50m`
    (training PDF uploads; the 1m default 413s them).
  - **ONE Postgres container, both databases**, seeded from the two committed
    dumps by `db/initdb/*.sh` — which run only once, on an empty volume, so
    re-seeding is `docker compose down -v`. `postgres:18` moved its data
    directory: the volume must mount at **`/var/lib/postgresql`**, NOT
    `.../data` (the old path makes the image refuse to boot). The healthcheck
    must be `pg_isready -h 127.0.0.1` — the socket form reports ready while the
    entrypoint is still seeding on its temporary socket-only server.
    `SchemaBootstrap` still supplies everything the dumps lack, unchanged.
  - **RAG generation stays on the HOST's Ollama** (`OLLAMA_BASE` →
    `host.docker.internal`, `extra_hosts: host-gateway`): Docker on macOS has no
    GPU passthrough, so an in-container Ollama is CPU-only and far slower. torch
    installs from PyTorch's **CPU index** (the PyPI wheel drags in all of CUDA)
    with a plain-PyPI fallback for arm64. `data/` (chroma + graph + uploads) is a
    named volume seeded from the image's committed baseline; the bge-m3 download
    lands in a second volume, and `PREFETCH_EMBED_MODEL=1` bakes it into the
    image instead (~3GB bigger, offline-capable — right for CI/prod, wrong for
    an 8GB laptop). `run.py`'s `--reload` is bypassed; uvicorn runs directly,
    one worker.
  - Published ports dodge the two permanently-busy host ports so the stack can
    run **alongside** the native four-terminal setup: web on **8080** (5173 is
    vite), Postgres on **5433** (5432 is Homebrew PG). All overridable in `.env`.
  - The two Java images kept their `ENV SWAGGER_ENABLED=false` /
    `DEMO_TOOLS_ENABLED=false` (off by construction stays); the demo compose
    file opts back in explicitly and visibly. Both run as UID 1000 and both
    now install `curl` — imed-mock's existing HEALTHCHECK had always been
    silently failing, because the JRE image ships no HTTP client.
  Verified live in containers: both DBs seeded, all four services healthy,
  login + `GET /api/cases` through the nginx proxy, `POST /api/sync` pulling
  from imed-mock over the compose network, and an approve writing 5 diff rows
  with `coding_status='approved'` on the hospital visit row (`dischargestatus`
  correctly untouched). Found in passing, NOT ours: `npm ci` fails in
  `../audit-chart-frontend` on a pre-existing peer conflict
  (`eslint-plugin-jsx-a11y@6.10.2` wants eslint ≤9, devDeps pin eslint 10) —
  its Dockerfile uses `--legacy-peer-deps` and the repo is untouched.
  This does NOT replace the native dev loop, and `RUN-ALL.md`'s manual path
  stays the documented route for anyone not using Docker.
- ✅ **New iMed read contract (R1–R6) mocked — hospital-independent (2026-08-19):**
  MedCode AI wrote its own build contract for the hospital's read side
  ("MedCode AI Case Data API", `docs/MedCode-AI-iMed-Integration-API-Contract-v1.pdf`,
  v1 11 Aug 2026) and SENT it — the hospital builds R1–R6 from that document.
  Rather than wait, the fake side was built to the contract first, so
  development runs at full speed and cutover is an `IMED_API_BASE` + token
  swap. **Write side W1–W4 needed ZERO change** — the contract states outright
  that the request bodies are what we already send, `coding_status` extension
  included. Only the READ side is new, and it replaces the 12 per-table GETs
  with a nested **case object**: one `visit` block + nine data blocks
  (`documents`, `record_results`, `diagnoses`, `procedures`, `drug_orders`,
  `lab_results`, `vitals`, `ward_movements`, `billing_items`), every key
  renamed to the contract's snake_case (`transactionnumber` → `visit_id`,
  `icd` → `icd10_code`, `startdatetime` → `operation_start`). Built in
  `../imed-mock-api` (new `web/CaseSyncApiController` + `repo/ImedCaseSyncRepository`,
  `ApiExceptionHandler` gained a 422 `ImedUnprocessableException`), on
  `/api/v1` so the existing Bearer gate covers it. **Faithfulness over
  convenience was the explicit rule** — R2 refuses >20 ids (`422
  too_many_visit_ids`), R3 refuses >31 days (`422 period_too_long`), both in
  the hospital's `STATUS_BUSINESS_ERROR` envelope; datetimes are normalized to
  ISO 8601 (the extract stores `YYYY-MM-DD HH:MM:SS`), `birth_date` is a plain
  date, `age_year` is a number (extract stores `"70,2,9"`), blanks collapse to
  null, cancelled rows still never appear. **No schema change was needed after
  all** (contradicting the first read of the contract): `last_changed_at` and
  `encounter_type` are DERIVED — the change stamp reuses the tested
  `LAST_CHANGED` SQL (visit datetime raised by code-row writes) and IPD is
  "has an admission number", per the contract's own "the internal mechanism is
  the hospital's choice". R6 answers from a static `SUPPORTED_FIELDS` list of
  every `block.field` served — it correctly reports the contract's own
  Priority-2 wishes (`lab_results.reference_range`, doctor names) as missing.
  Verified live against the seeded demo data plus 8 new tests (mock suite
  16 → **24/24 green**), including a create → read → cancel → read round trip.
  Trap worth remembering: **Java text blocks strip trailing whitespace**, so
  `"""… WHERE """ + FRAGMENT` concatenated to `WHEREGREATEST(` — the SQL
  joins now add `+ " " +` explicitly. NOT done yet: medcode-api still calls the
  12 legacy GETs; `ImedApiClient` + `SyncService` move over next, and the old
  endpoints stay until then.
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
- **Adding an endpoint fails the build until you list it** in
  `OpenApiDocsTest.EXPECTED_PATHS` (two-way since 2026-07-29). That assertion is
  the ONLY mechanical force keeping the docs honest — springdoc generates the
  spec from the controller annotations, so nothing else notices a new route.
  When it fails, the fix is to document the endpoint in `docs/api-contract.md`
  + `docs/types.ts` and *then* add the path, not to add the path alone.
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
  backend; the repo itself stays out of scope here. One loose end on OUR side
  of the seam, re-checked 2026-08-07: `POST /api/cases/{id}/sync` (per-case)
  still has no caller — bulk `/api/sync` and the whole Training/knowledge
  surface ARE wired. Not a promise we've made. (Analytics and Agent used to sit
  in this list as permanently-mocked pages; both are live now — see the
  2026-08-07 Progress entry.)
- **`GET /api/icd-codes` has no automated test.** It is documented and
  hand-verified, but nothing asserts its behavior — which is precisely how the
  2026-07-29 break shipped green. Covering the UNION path, the `system` filter,
  the limit cap and the two 400s in `CasesApiIntegrationTest` is the natural
  next step.
- **M7 cutover** (above).

## Full history

- Complete migration plan (context, file mapping, gotchas):
  `~/.claude-work/plans/what-is-current-backend-refactored-gosling.md`
- iMed split + contract-ownership plan:
  `~/.claude/plans/lets-split-repo-first-shimmying-ripple.md`
