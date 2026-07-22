# imed-mock-api

A **mock of the iMed hospital API**: the HTTP endpoints the hospital must
provide in production, implemented as a live, runnable example over the real
sample extract data. Two audiences:

1. **Hospital clients** — this IS the integration spec. "Give us APIs like
   this": the READ endpoints serve your case data; the two coding-result
   endpoints receive our approval results.
2. **medcode-api** — calls the coding-result endpoints on approve/reopen,
   exactly as it will call the hospital's real API later. Swapping this mock
   for the real thing is a base-URL change (`IMED_API_BASE` in medcode-api).

Spring Boot 4.1 / Java 21, Maven (`./mvnw`), plain SQL — no JPA, no Python.
Owns the `imed` PostgreSQL database exclusively; no other app touches it.

## The spec, generated

Because this app IS the integration spec, the spec is generated from the
running code rather than maintained by hand — the tables below can drift, the
generated document cannot.

| URL | What |
|---|---|
| `/swagger-ui.html` | Browsable API, try-it-out against the seeded data |
| `/v3/api-docs` | OpenAPI 3.1 JSON |
| `/v3/api-docs.yaml` | OpenAPI 3.1 YAML — **the file to hand the hospital's integrators** |

The write-back rules (MCAI- prefix, required `status`, the `diagnosisType`
vocabulary) are declared once as Bean Validation constraints on
`CodingResultRequest`, so what the server enforces and what the document
publishes cannot disagree.

## The API

### READ — "give us your case data"

One endpoint per hospital extract table. Responses are the rows verbatim:
exact extract column names, all values as stored (TEXT — datetime formats are
non-uniform in the source; parsing is the consumer's job).

| Endpoint | Source table |
|---|---|
| `GET /api/cases` | MedHack_Patient (all visits) |
| `GET /api/cases/{tn}/medical-records` | MedHack_MedicalRecord |
| `GET /api/cases/{tn}/medical-record-results` | MedHack_MedicalRecord_result |
| `GET /api/cases/{tn}/diagnoses` | MedHack_Diagnosis(ICD10) |
| `GET /api/cases/{tn}/procedures` | MedHack_Procedure(ICD9) |
| `GET /api/cases/{tn}/orders/drugs` | MedHack_OrderDrug |
| `GET /api/cases/{tn}/orders/labs` | MedHack_OrderLAB |
| `GET /api/cases/{tn}/vital-signs` | MedHack_VitalSign |
| `GET /api/cases/{tn}/bed-management` | MedHack_BedManagement |
| `GET /api/cases/{tn}/billing-items` | MedHack_BillingItem |
| `GET /api/cases/{tn}/coding-status` | MedHack_CaseCodingStatus (what MedCode AI wrote back; 404 while uncoded) |

`{tn}` is the transaction number (visit number). Unknown `{tn}` → `404
{"error":"not found"}`; a known case with no rows in a table → `[]`.

### WRITE — "receive our approval results"

The LIMITED write-back on case finalization: exactly two things — the case
coding status and the finalized ICD codes, stored as NEW rows whose `id` is
prefixed **`MCAI-`** (the marker separating MedCode AI codes from hospital
originals; enforced with a 400). Clinical notes and hospital-entered codes are
never modified.

```
PUT /api/cases/{tn}/coding-result
{
  "status": "approved",
  "finalizedAt": "2026-07-22 12:00:00",
  "updatedBy": "web.coder",
  "encounterType": "0",
  "codes": [
    {"id": "MCAI-123", "icd": "E11.9", "name": "Type 2 diabetes",
     "type": "diagnosis", "diagnosisType": "PRIMARY_DIAGNOSIS"},
    {"id": "MCAI-124", "icd": "39.95", "name": "Hemodialysis",
     "type": "procedure"}
  ]
}
→ {"ok": true, "statusRows": 1, "codeRows": 2}
```

- Replaces any previously submitted result for the case (idempotent — safe to
  retry). `type` routes the row: `"procedure"` → MedHack_Procedure(ICD9),
  anything else → MedHack_Diagnosis(ICD10) with `diagnosisType` stored verbatim
  (`PRIMARY_DIAGNOSIS` / `COMORBIDITY` / `OTHERS` / `EXTERNAL_CAUSE_OF_INJURY`).
- Rejected with 400 `{"error": "..."}`: any code id missing the `MCAI-` prefix,
  a blank `status`, or a malformed body. Several problems at once come back as
  one message joined with `; `. `finalizedAt` / `updatedBy` / `encounterType`
  are optional — absent means a null column, not an error.

```
DELETE /api/cases/{tn}/coding-result   → {"ok": true}
```

- Reopen: removes the coding-status row and every `MCAI-` code row. Idempotent.

### Health

`GET /api/health` (no DB) · `GET /api/healthz` (real `COUNT(*)`). Both stay in
the published contract for existing callers.

For container probes prefer Actuator, which checks the connection pool itself:
`GET /actuator/health/liveness` · `GET /actuator/health/readiness` (the
readiness group includes the `db` check, so an unreachable Postgres reports
DOWN rather than merely failing every request). The Dockerfile HEALTHCHECK
uses readiness.

**Auth: none in this mock.** The production API the hospital provides will
need authentication — scheme TBD with the hospital.

## Local dev — first-time setup included

**Just cloned this (or got it from a teammate)?** The `imed` database is NOT
shipped pre-built — you create it from the committed seed file:

```bash
brew install postgresql@18 && brew services start postgresql@18   # once per machine
scripts/seed_local_imed_pg.sh     # creates + seeds db "imed" from db/seed.sql.gz
./mvnw spring-boot:run            # :8003 — browse http://localhost:8003/swagger-ui.html
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

## Environment variables

| Var | Meaning |
|---|---|
| `DATABASE_URL` | libpq-form DSN (`postgresql://user:pass@host:port/db`). Unset = `localhost:5432/imed`. |
| `JDBC_DATABASE_URL` | Already-JDBC URL; wins over `DATABASE_URL`. |
| `PORT` | HTTP port (default 8003). |

## Testing

```bash
./mvnw test
```

`ImedMockApiIntegrationTest` runs against the local seeded `imed` Postgres
(`@SpringBootTest` + MockMvc, no test containers, no mocks): read endpoints,
the MCAI- prefix rule and the other body constraints, the full coding-result
round trip (submit → visible → replace → clear), and the published contract
itself — that `/v3/api-docs` covers every endpoint and carries the MCAI- rule,
so the spec cannot silently drift from the code.

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
