# imed-mock-api

A **mock of the iMed hospital API**: the HTTP surface between MedCode AI and
the hospital, implemented as a live, runnable example over the real sample
extract data. Two audiences:

1. **Hospital clients** — the READ endpoints are the integration spec for the
   extract data ("give us APIs like this"); the WRITE endpoints under
   `/api/v1` mock the hospital's OWN contract back at them — the "iMed
   Diagnosis and Medical Discharge API" PDF (rev 1, 24 Jul 2026). (The
   invented coding-status extension was withdrawn 2026-08-02 — the mock now
   mirrors the PDF exactly.)
2. **medcode-api** — calls the `/api/v1` write endpoints on approve/reopen,
   exactly as it will call the hospital's real API later. Swapping this mock
   for the real thing is a base-URL + token change (`IMED_API_BASE` /
   `IMED_API_TOKEN` in medcode-api).

Spring Boot 4.1 / Java 21, Maven (`./mvnw`), plain SQL — no JPA, no Python.
Owns the `imed` PostgreSQL database exclusively; no other app touches it.

## The spec, generated

Because this app IS the integration spec, the spec is generated from the
running code rather than maintained by hand — the tables below can drift, the
generated document cannot.

| URL | What |
|---|---|
| `/console.html` | Minimal try-it-out console (single static page, reads `/v3/api-docs` live) |
| `/swagger-ui.html` | Browsable API, try-it-out against the seeded data |
| `/v3/api-docs` | OpenAPI 3.1 JSON |
| `/v3/api-docs.yaml` | OpenAPI 3.1 YAML — **the file to hand the hospital's integrators** |

The `/api/v1` write bodies are typed records with the hospital PDF's exact
snake_case field names (`DiagnosisRequest`), so the published schema mirrors
their contract field-for-field.

## The API

### READ — `/api/v1`, the MedCode AI Case Data API contract (R1–R6)

The read surface MedCode AI **asked the hospital to build** — see
`../medcode-api/docs/MedCode-AI-iMed-Integration-API-Contract-v1.pdf`. It is
mocked here first so development doesn't wait for the hospital's
implementation; when the real API lands, medcode-api swaps `IMED_API_BASE`
and nothing else changes.

Bearer-authenticated like the write side (same `IMED_API_TOKEN`).

| # | Endpoint | Purpose |
|---|---|---|
| R1 | `POST /api/v1/cases/check` | Did anything change after `changed_since`? → `{has_changes, visit_ids}`. The cheap poll; no clinical data |
| R2 | `POST /api/v1/cases/sync` | Full case data for up to **20** `visit_ids` → `{cases, not_found}` |
| R3 | `POST /api/v1/cases/sync-by-period` | Same data for a visit-date window (`from`/`to`, both ends included, max **31 days**) → `{cases}` |
| R4 | `GET /api/v1/catalog/icd10` | ICD-10 code master → `[{code, description, edition}]` |
| R5 | `GET /api/v1/catalog/icd9` | ICD-9 code master, same shape |
| R6 | `POST /api/v1/contract/check` | Schema gate: send `required_fields` as `block.field` names → `{valid}` or `{valid:false, missing:[…]}` |

R2/R3 answer with the contract's nested **case object** — one `visit` block
plus nine data blocks (`documents`, `record_results`, `diagnoses`,
`procedures`, `drug_orders`, `lab_results`, `vitals`, `ward_movements`,
`billing_items`). Blocks with no rows are `[]`, never absent.

Three transport rules are enforced here because on the real API they are the
hospital's job:

- **Date-times are ISO 8601** (`2026-04-01T06:45:00`). The extract stores
  `2026-04-01 06:45:00`, so every datetime is normalized on the way out;
  `birth_date` is served as a plain date.
- **Missing values are `null`** — never `""`, never an absent key. The
  extract uses both `NULL` and `''` for "nothing", so blanks collapse.
- **Cancelled code rows never appear**, same rule as the older reads.

Two visit fields are DERIVED, not stored: `encounter_type` (IPD when the
visit has an admission number, else OPD) and `last_changed_at` (the visit
datetime, raised by any later write to its code rows). The contract leaves
the change-timestamp mechanism to the hospital, so no column was added.

The limits are real, not decorative: 21 ids → `422 too_many_visit_ids`, a
32-day window → `422 period_too_long`, both in the hospital's
`STATUS_BUSINESS_ERROR` envelope. A convenient shortcut here would only
surface on cutover day.

### Demo tooling (mock-only)

| Endpoint | Purpose |
|---|---|
| `POST /api/demo/snapshot` | freeze every `imed.*` table into the `imed_baseline` schema |
| `POST /api/demo/reset` | truncate + restore every `imed.*` table from `imed_baseline` (undoes all write-backs; 400 before the first snapshot). Called by medcode-api's `POST /api/demo/reset` so one button resets both sides |

Not part of the hospital contract — the real iMed API has nothing like this,
so never ask the hospital for it.

### WRITE — `/api/v1`, the hospital's real contract (mocked)

Mirrors the "iMed Diagnosis and Medical Discharge API" PDF field-for-field:
`Authorization: Bearer <token>` (mock: `IMED_API_TOKEN`, default
`imed-mock-token`), snake_case bodies, `{request_id, status, result}`
envelopes, and `request_id` dedup — replaying a request returns the stored
response instead of re-executing.

| Endpoint | What |
|---|---|
| `POST /api/v1/diagnosis` | Create ICD-10 dx + ICD-9 procedures + medical discharge in ONE transaction. New rows carry NO `object_id`; generated ids come back in `result` — keep them for PUT/DELETE |
| `PUT /api/v1/diagnosis/{visit_id}` | Edit existing rows by their `object_id`; only provided fields change |

POST and PUT carry one field that is NOT in the hospital's PDF: the optional
`coding_status` (medcode's proposed extension — open question 17 in
medcode-api's `docs/imed-integration.md`). `"approved"` marks the visit's own
`medhack_patient.coding_status`, the reserved word `"open"` clears it again on
reopen, and absent/blank changes nothing — so a caller speaking the exact
hospital contract is unaffected. It sets the visit in the SAME transaction as
the codes; a body carrying only `coding_status` marks the visit without
touching a code row. Any other word is a 400 (mock-only strictness).

The discharge status the caller sends (`fix_opd_discharge_status_id` /
`fix_ipd_discharge_status_id`) stays inside `doctor_discharge_opd` / `_ipd`.
Until 2026-08-07 it was also written onto `medhack_patient.dischargestatus` —
that column is the DOCTOR's clinical outcome, so the write API no longer
touches it.

| `DELETE /api/v1/diagnosis/{visit_id}/icd10/{id}` | Cancel one diagnosis — iMed's cancel flow: flagged `is_cancelled`, never hard-deleted, gone from reads. Idempotent |
| `DELETE /api/v1/diagnosis/{visit_id}/icd9/{id}` | Same for one procedure |

Errors, verbatim from the PDF: `400 {"status":"STATUS_BUSINESS_ERROR",
"message":"invalid_request","message_th":…}` (the mock adds a `detail` key as
a debugging aid — the real API does not), `401 {"message":"unauthorized",…}`,
`409 {"message":"DIAGNOSIS_CODE_ALREADY_EXIST",…}` on a duplicate live ICD-10
code for the visit.

Mock master data (real IDs arrive with the hospital's master-data list and
slot into the same fields): `fix_visit_type_id` = `OPD` | `IPD`,
`fix_diagnosis_type_id` = `PRIMARY_DIAGNOSIS` / `COMORBIDITY` / `OTHERS` /
`EXTERNAL_CAUSE_OF_INJURY`, `fix_operation_type_id` = any non-blank string.

The invented `PUT/DELETE /api/cases/{tn}/coding-result` contract from the
first mock iteration is **gone** — superseded by the endpoints above.

### Health

`GET /api/health` (no DB) · `GET /api/healthz` (real `COUNT(*)`). Both stay in
the published contract for existing callers.

For container probes prefer Actuator, which checks the connection pool itself:
`GET /actuator/health/liveness` · `GET /actuator/health/readiness` (the
readiness group includes the `db` check, so an unreachable Postgres reports
DOWN rather than merely failing every request). The Dockerfile HEALTHCHECK
uses readiness.

**Auth:** the `/api/v1` write surface requires `Authorization: Bearer
<IMED_API_TOKEN>` (default `imed-mock-token`), mimicking the real contract;
token issuance for production is the hospital's side. The extract READ
endpoints are open in this mock — production read auth still TBD.

## Local dev — first-time setup included

**Just cloned this (or got it from a teammate)?** The `imed` database is NOT
shipped pre-built — you create it from the committed seed file:

```bash
brew install postgresql@18 && brew services start postgresql@18   # once per machine
scripts/seed_local_imed_pg.sh     # creates + seeds db "imed" from db/seed.sql.gz
./mvnw spring-boot:run            # :8003 — browse http://localhost:8003/console.html
```

Good to know:

- `db/seed.sql.gz` is the demo-start baseline — real hospital sample extracts,
  **21 visits across the 10 `imed.medhack_*` tables**. Restoring is plain
  `psql`; no Python anywhere. It is data, but it is **not frozen**: regenerate
  it with `pg_dump` from a local `imed` that is already at demo start (see
  *Regenerating the dump* below). The catalogs (`icd_10`, `icd_9`) and the
  write-surface tables (`imed_request_log`, `doctor_discharge_*`) are NOT in
  the dump — the Flyway migrations own those.
- **Re-running the seed script wipes the database back to the baseline**
  (any coding results written by medcode-api are discarded).
- The full stack needs the sibling repo `../medcode-api` too — see its README
  for the two-repo setup.
- Java 21 required; `./mvnw` fetches Maven itself. Postgres not from
  Homebrew? Point `PGBIN` at your Postgres `bin` directory.

## The `imed` schema — tables are NOT in `public`

Every table lives in a schema named **`imed`**, inside a database also named
`imed`. Nothing is in `public` — it exists but is empty.

That is history, not design: the hospital extracts and medcode's own tables
once shared a single database, where the `imed` schema kept the two apart.
The 2026-07-22 repo split gave this side its own database, but the dump is
still taken with `pg_dump -n imed`, so its `CREATE SCHEMA imed` comes along
unchanged — and renaming the schema now would be a migration across every
statement in `repo/` for no gain.

Consequences, all of them ordinary once you know:

- **Always qualify the schema in SQL** — `FROM imed.medhack_patient`, never
  `FROM medhack_patient`. Every statement in `repo/` already does. A missing
  prefix compiles fine and fails at *runtime* with "relation does not exist",
  possibly only on a rarely-hit endpoint — the one real trap here. Deliberately
  no `currentSchema=imed` in the JDBC URL: it would paper over a missing
  prefix instead of surfacing it.
- **Database clients hide it.** DataGrip/DBeaver/pgAdmin show only `public` by
  default, so the database looks empty. Tick the `imed` schema in the client's
  schema chooser (the "1 of 4" style badge on the database node). For ad-hoc
  psql, `SET search_path TO imed;` once per session.
- **Deploying needs an explicit grant.** Locally you own the schema so this
  never shows up; with a separate application role it fails as "permission
  denied for schema imed". Grant it when provisioning:

  ```sql
  GRANT USAGE ON SCHEMA imed TO <app_role>;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA imed TO <app_role>;
  ALTER DEFAULT PRIVILEGES IN SCHEMA imed
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO <app_role>;
  ```

  (The last line covers tables the Flyway migrations create at startup. The
  role also needs `CREATE` on the schema, since Flyway writes its own
  `imed.flyway_schema_history` table there.)

## Schema changes

Everything the `/api/v1` write surface needs on top of the extract dump lives in
`src/main/resources/db/migrations/V*.sql` and is applied by **Flyway** at
startup, into the `imed` schema. Pull and boot:

```bash
git pull
./mvnw spring-boot:run     # Flyway applies anything missing
```

The dump is version 0; a database that already has content but no history table
is adopted automatically (`baseline-on-migrate`). Every migration is guarded
(`IF NOT EXISTS` / `ON CONFLICT DO NOTHING` / `WHERE NOT EXISTS`), so one that
already had these applied by the old startup runner takes them as no-ops.

| Version | Change |
|---|---|
| `V1` | `is_cancelled`, `imed_request_log`, `doctor_discharge_opd` / `_ipd` |
| `V2` | `icd_10` / `icd_9` catalog tables |
| `V3` | `updated_at`, backing the `changed_since` filter |
| `V4` | the five pre-coded demo visits |
| `V5` | `coding_status` on the visit row |
| `V6` | the ~1000 ICD catalog rows |

```bash
psql -d imed -c "SELECT version, description, success FROM imed.flyway_schema_history ORDER BY installed_rank"
```

A re-seed drops all of it — the dump predates every migration — along with the
history table, so booting the app replays the lot from version 0.

**Adding a change:** add one `V<n>__<name>.sql` file, and do NOT also write the
DDL in Java. Until 2026-08-20 every statement lived in `config/SchemaBootstrap`
AND in a `db/migrations` file that nothing ran; on the medcode side the same
duplication silently cost two tables their foreign keys.

## Regenerating the dump

`db/seed.sql.gz` is the **only** source of hospital data Docker boots from
(`medcode-stack/docker-compose.yml` bind-mounts it into the Postgres container's
initdb), and `scripts/seed_local_imed_pg.sh` restores the same file locally. So
when the demo data changes, it changes *here* — a database edited only in place
reaches nobody else. That is exactly how the dump drifted a month behind the
working local database before 2026-08-21.

Regenerate from a local `imed` that is already at **demo start** — 21 visits, no
approvals written back:

```bash
pg_dump -d imed -n imed --no-owner --no-privileges \
  -T imed.flyway_schema_history \
  -T imed.icd_10 -T imed.icd_9 \
  -T imed.imed_request_log \
  -T imed.doctor_discharge_opd -T imed.doctor_discharge_ipd \
  | gzip -9 > db/seed.sql.gz
```

Why each exclusion:

- **`flyway_schema_history`** — the dump must stay version 0 so
  `baseline-on-migrate` adopts it and replays V1–V6. Ship the history table and
  Flyway thinks the work is already done.
- **`icd_10` / `icd_9` / `imed_request_log` / `doctor_discharge_*`** — created by
  V1/V2 and filled by V6. The dump is the frozen hospital *extract*; everything
  we added since belongs to the migrations.
- **the `imed_baseline` schema** — a runtime snapshot taken by
  `POST /api/demo/snapshot`, not seed data. `-n imed` already leaves it out.

If the source database has served a demo, strip the write-back rows first — our
own mock generates them, and they are not hospital data — and un-cancel any SEED
row an approve/reopen cycle knocked out:

```sql
DELETE FROM imed.medhack_diagnosis_icd10 WHERE id !~ '^[0-9]+$';  -- DX10-*
DELETE FROM imed.medhack_procedure_icd9  WHERE id !~ '^[0-9]+$';  -- PX9-*
UPDATE imed.medhack_patient       SET coding_status = NULL;
UPDATE imed.medhack_procedure_icd9  SET is_cancelled = NULL WHERE id ~ '^[0-9]+$';
UPDATE imed.medhack_diagnosis_icd10 SET is_cancelled = NULL WHERE id ~ '^[0-9]+$';
```

The numeric-id rows are the hospital's own extract; only `DX10-*`/`PX9-*` are
ours. That last pair matters: a cancelled seed procedure silently costs the demo
a complete case, which is exactly what happened to `86.3` on visit
`…813401900901` before 2026-08-21.

Then verify a clean boot before committing: restore into a scratch database, run
the six migrations, and check the counts — **21 patients, 5 active ICD-10, 6
active ICD-9, 191 medical records, catalogs 650/332, and 5 visits carrying both
codes** (those become the 5 complete cases after a Sync). Cross-check against
`db-backups/imed_demo_ready_2026-08-02.dump`, which is the same demo start
minus the V4 diagnoses.

## Environment variables

| Var | Meaning |
|---|---|
| `DATABASE_URL` | libpq-form DSN (`postgresql://user:pass@host:port/db`). Unset = `localhost:5432/imed`. |
| `JDBC_DATABASE_URL` | Already-JDBC URL; wins over `DATABASE_URL`. |
| `PORT` | HTTP port (default 8003). |
| `IMED_API_TOKEN` | Bearer token the `/api/v1` write endpoints require (default `imed-mock-token`). |

## Testing

```bash
./mvnw test
```

`ImedMockApiIntegrationTest` runs against the local seeded `imed` Postgres
(`@SpringBootTest` + MockMvc, no test containers, no mocks): read endpoints,
Bearer auth (401s), the full `/api/v1/diagnosis` life cycle (POST → visible in
reads → PUT edit → DELETE cancel → gone from reads, idempotent), the 409
duplicate rule, `request_id` replay semantics, the demo snapshot/reset round
trip, and the published contract itself — that `/v3/api-docs` covers every endpoint
with the PDF's exact field names, so the spec cannot silently drift from the
code. The write tests self-reset via the cancel flow, so re-runs are stable.

## Formatting

```bash
./mvnw spotless:apply     # reformat every Java file
./mvnw spotless:check     # fail if anything is unformatted
```

Spotless runs the Eclipse JDT formatter — the same engine VSCode's Java
extension uses on format-on-save — against `config/eclipse-formatter.xml`, so
saving in the editor and running the command produce identical output and
nobody's editor settings can start a whitespace war.

Two deliberate deviations from the Eclipse defaults: comment re-flow is off
(the prose here is hand-wrapped), and annotation arguments wrap at 120 instead
of never (the default drags long `@Operation`/`@Schema` descriptions onto
200-character lines).

## Docker

**The whole system in one command** — the sibling repo
[`medcode-stack`](https://github.com/Occamy-medihack/medcode-stack) runs this
mock, medcode-api, the web UI, RAG and one Postgres (holding both the `imed` and
`medcode` databases, each seeded from its repo's committed dump) as five
containers. Clone the five repos as siblings, then:

```bash
cd ../medcode-stack && cp .env.example .env && docker compose up -d --build
```

This service alone, against a database you already run:

```bash
docker build -t imed-mock-api .
docker run -p 8003:8003 \
  -e DATABASE_URL="postgresql://$USER@host.docker.internal:5432/imed" imed-mock-api
```
