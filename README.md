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

### READ — "give us your case data"

One endpoint per hospital extract table. Responses are the rows verbatim:
exact extract column names, all values as stored (TEXT — datetime formats are
non-uniform in the source; parsing is the consumer's job).

| Endpoint | Source table |
|---|---|
| `GET /api/cases` | MedHack_Patient (all visits; optional `from`/`to` window on the visit datetime — admissiondatetime, else the datetime encoded in the TN — and `changed_since` on the code rows' `updated_at`; bounds inclusive, `YYYY-MM-DD` or `YYYY-MM-DD HH:MM[:SS]`) |
| `GET /api/cases/{tn}/medical-records` | MedHack_MedicalRecord |
| `GET /api/cases/{tn}/medical-record-results` | MedHack_MedicalRecord_result |
| `GET /api/cases/{tn}/diagnoses` | MedHack_Diagnosis(ICD10) |
| `GET /api/cases/{tn}/procedures` | MedHack_Procedure(ICD9) |
| `GET /api/cases/{tn}/orders/drugs` | MedHack_OrderDrug |
| `GET /api/cases/{tn}/orders/labs` | MedHack_OrderLAB |
| `GET /api/cases/{tn}/vital-signs` | MedHack_VitalSign |
| `GET /api/cases/{tn}/bed-management` | MedHack_BedManagement |
| `GET /api/cases/{tn}/billing-items` | MedHack_BillingItem |
| `GET /api/icd10-codes` | imed.icd_10 — ICD-10 reference catalog (code master, not per-case) |
| `GET /api/icd9-codes` | imed.icd_9 — ICD-9 procedure reference catalog (not per-case) |
| `POST /api/demo/snapshot` | mock-only demo tooling: freeze every imed.* table into the `imed_baseline` schema |
| `POST /api/demo/reset` | mock-only demo tooling: truncate + restore every imed.* table from `imed_baseline` (undoes all write-backs; 400 before the first snapshot). Called by medcode-api's `POST /api/demo/reset` so one button resets both sides |

`{tn}` is the transaction number (visit number). Unknown `{tn}` → `404
{"error":"not found"}`; a known case with no rows in a table → `[]`.
Cancelled diagnosis/procedure rows (see DELETE below) are excluded — they
stay in the tables for the audit trail but are invisible to reads, so a sync
can never resurrect a code a coder removed.

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

- `db/seed.sql.gz` is the frozen demo baseline — real hospital sample
  extracts (73k rows across 11 tables), dumped once from the original POC
  pipeline. Restoring is plain `psql`; no Python anywhere.
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
The 2026-07-22 repo split gave this side its own database, but `db/seed.sql.gz`
is frozen baseline data (regenerating it needs the retired POC pipeline), so
the dump's `CREATE SCHEMA imed` came along unchanged.

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

  (The last line covers tables `SchemaBootstrap` creates at startup.)

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

```bash
docker build -t imed-mock-api .
docker run -p 8003:8003 \
  -e DATABASE_URL="postgresql://$USER@host.docker.internal:5432/imed" imed-mock-api
```
