# medcode-api — API contract

**This document is the source of truth for the MedCode AI backend API.** The
next frontend is built against it (TypeScript mirror: [types.ts](types.ts)).
Any change to a response shape must update this file, `types.ts`, and
`CasesApiIntegrationTest` in the same commit.

Base URL: the backend origin (local dev `http://localhost:8001`). All bodies
are JSON. CORS: `ALLOWED_ORIGINS` env (`*` by default).

## Conventions

- **Key order is stable** and matches the shapes below (objects are built in
  insertion order server-side).
- **Conditional keys** (present only sometimes) are marked `?`. Everything
  else is always present, possibly `null`.
- **Every value is real DB data.** Where no real source exists yet the field
  is `null` (`patient`, `confidence`, `revenue_impact`) or a documented
  static placeholder (`"—"`, `drg`). Nothing is synthesized per case.
- **Datetimes are raw text.** Hospital-sourced datetime fields carry the
  hospital's original strings (formats vary, e.g. `2026-04-01 06:45:00`, and
  can be malformed — treat as opaque display text). Fields written by this
  backend (`codedDate`, `fetched_at`, working-state timestamps) use
  `YYYY-MM-DD HH:MM:SS` (or `YYYY-MM-DD` where sliced).
- **Errors**: `400` / `404` return `{"error": "<message>"}`. `500` (e.g. the
  hospital iMed call failed after our commit) returns Spring's default error
  body; the triggering action is idempotent — retry it.

## Endpoints

### GET /api/health
`{"ok": true}` — no DB touch.

### GET /api/healthz
`{"ok": true, "cases": <int>, "db": "pg"}` — real `COUNT(*)`; liveness check.

### GET /api/cases — the dashboard payload

Cached in-process; rebuilt after any approve / reopen / demo-reset. Lists
**OPD visits only** (`encountertype = '0'`).

```jsonc
{
  "stats": { "total": 1101, "complete": 780, "incomplete": 296, "finished": 25 },
  "complete":  [ <CaseCard>, ... ],          // complete, not yet approved
  "incompleteGroups": [                       // sorted by size desc, then label
    { "id": "medicine",                       // "surgery" | "ct-x-ray" | "medicine" | "other"
      "label": "Medicine Group",
      "total": 123,
      "cases": [ <CaseCard + missing>, ... ] },
    ...
  ],
  "finished": [ <FinishedCard>, ... ]         // approved queue (exclusive)
}
```

**CaseCard** — field ↔ real source:

| Field | Type | Source / meaning |
|---|---|---|
| `id` | `string` | `cases.case_id` — the real iMed transaction (visit) number |
| `patient` | `null` | no real patient-name source exists (hospital never exports names) |
| `hn` | `string \| null` | `cases.patient_ref` (admission number). OPD extracts don't carry it → currently always `null` on dashboard rows |
| `dept` | `string` | `department`, else `ward`, else `"—"` |
| `ward` | `string \| null` | `cases.ward` (latest bed row at sync time) |
| `group` | `string` | `cases.disease_group`, else `"Ungrouped"` |
| `confidence` | `null` | no real AI-confidence source exists yet |
| `severity` | `string` | `cases.severity_level` (`low`/`medium`/`high`) |
| `coverage` | `string \| null` | `cases.coverage_type` (hospital's own code, e.g. `UCS_89_I`) |
| `coverageLabel` | `string \| null` | from `coverage_types`: `label_th` → `label_en` → `scheme_family` (labels are null until the hospital provides its official list) |
| `coverageFamily` | `string \| null` | `coverage_types.scheme_family` (`OFC`/`UCS`/`SELF_PAY`/…) |
| `coders` | `string[]` | real actor ids from the audit trail, first-touch order (`demo.reset` excluded) |
| `encountertype` | `"0"` | OPD marker (dashboard is OPD-only) |
| `ccpi` | `string \| null` | 120-char snippet: Chief Complaint → Subjective → Present Illness |
| `cc` | `string` | Chief Complaint → Subjective snippet, `""` when none |
| `pi` | `string` | Present Illness snippet, `""` when none |
| `codes` | `CodeChip[]` | first 6 of `{code, system, role}`, principal → secondary → procedure → other |
| `orders` | `object` | `{category: count}`, key order CT, ROIP, X-ray, lab, medicine, other, surgery |
| `created_at` | `string \| null` | `cases.admissiondatetime` (raw hospital text). OPD rows lack it → currently always `null` here |
| `updated_at` | `string \| null` | `cases.dischargedatetime` — same caveat |
| `revenue_impact` | `null` | no real DRG/revenue source exists |
| `reopened?` | `true` | only on reopened, not-yet-reapproved cases (human reopen, not demo.reset) |
| `reopenedAt?` | `string` | `YYYY-MM-DD`, only alongside `reopened` |
| `reopenedBy?` | `string` | real actor id, only alongside `reopened` |
| `missing?` | `string` | **incomplete rows only**: human-readable labels joined with `", "`, else `"—"` |

**FinishedCard** = CaseCard **without** `confidence`/`ccpi`/`cc`/`pi`, plus:

| Field | Type | Source / meaning |
|---|---|---|
| `codedDate` | `string` | approval `at` (`YYYY-MM-DD`) from the audit trail, else `fetched_at[:10]` |
| `coder` | `string` | real approving actor id (e.g. `demo.coder`, `web.coder`), `""` if unknown |
| `coderId` | `string` | same, but `"—"` if unknown |
| `drg` | `"—"` | static placeholder — no DRG source exists |
| `reopenable` | `true` | DEPRECATED constant: any coder may reopen any case |

### GET /api/cases/{caseId} — case detail

`404` when unknown. Serves ALL cases (IPD included — `hn`-type fields carry
real values here when the extract has them).

```jsonc
{
  "case": {          // the full cases row, schema column order
    "case_id": "…", "patient_ref": "690003026", "encountertype": "1",
    "sex": "F", "birthdate": "1961-01-19", "ageyear": "65,2,13",
    "admissiondatetime": "2026-04-01 06:45:00", "dischargedatetime": "…",
    "dischargetype": "…", "dischargestatus": "…", "ispregnant": "…",
    "ward": "…", "department": "…", "coverage_type": "…",
    "completeness_status": "complete", "missing_detail": null,
    "disease_group": "…", "severity_level": "…", "case_status": "open",
    "fetched_at": "YYYY-MM-DD HH:MM:SS"
  },                  // every value string|null (raw hospital text) except as shown
  "coverage": { "coverage_code": "…", "scheme_family": "…", "label_th": null,
                "label_en": null, "payer": "…" },   // or null
  "sections": [ { "documenttype": "…", "fieldname": "…", "value": "…",
                  "recorddatetime": "…" }, ... ],    // sorted by recorddatetime, nulls first
  "codes":    [ { "code": "…", "code_system": "ICD-10|ICD-9", "description": "…",
                  "code_role": "…", "source": "imported_from_imed|coder_assigned" }, ... ],
  "orders":   [ { "order_category": "…", "imed_source": "…", "order_name": "…",
                  "ordered_at": "…" }, ... ],        // max 150, category-grouped
  "codeEdits": <CodeEdit[] | null>,   // last PUT …/codes payload, echoed verbatim
  "reportDraft": <string | null>      // last PUT …/draft text (feature deprecated)
}
```

### PUT /api/cases/{caseId}/codes — save the coder's working code list

Request: a **bare JSON array** of `CodeEdit` (stored verbatim, echoed back as
`codeEdits`). Fields the backend interprets at approve time:

```jsonc
[ { "code": "E11.9",          // skipped if empty or "???"
    "type": "ICD-10",         // default "ICD-10"; "ICD-9"/"…PCS" → procedure
    "desc": "Type 2 diabetes",
    "missing": false          // truthy → row skipped at approve
  }, ... ]                    // extra fields are stored + echoed, not interpreted
```

Responses: `{"ok": true}` · `400` (not an array) · `404` (unknown case).
Working state never invalidates the dashboard cache and survives reopen.

### PUT /api/cases/{caseId}/draft — save the report draft (deprecated feature)

Request `{"text": "…"}` → `{"ok": true}` · `400` / `404` as above.

### POST /api/cases/approve

Request `{"ids": ["<case_id>", …], "coder": "web.coder"}` (`coder` optional,
default `web.coder`). For each existing case: the saved `codeEdits` become
real coder-assigned codes (no edits → the imported principal diagnosis is
re-confirmed), the case is finalized, and the results are sent to the
hospital's iMed API. Response:

```jsonc
{ "ok": true,
  "approved": ["<case_id>", …],
  "notFound": [],
  "stats": { "cases_finalized": 1, "status_rows": 1,
             "coder_codes_created": 1, "mcai_code_rows": 1 } }
```

`400` when `ids` is missing/empty/non-strings. Our DB commits first, then the
hospital calls run; if a hospital call fails the request 500s with our side
committed — **approve again** to heal (idempotent).

### POST /api/cases/{caseId}/reopen

Request `{"coder": "web.coder"}` (optional). Reverses an approve on both
sides; the coder's saved edits/draft are KEPT. Response `{"ok": true}` ·
`404` unknown case. Same 500-then-retry semantics as approve.

### POST /api/demo/reset

Request `{"baselineCoder": "demo.coder"}` (optional). Restores the demo
baseline: reopens every non-baseline approval and re-finalizes baseline cases
a visitor touched. Response
`{"ok": true, "reopened": <int>, "restoredBaseline": <int>}`.

## Downstream: the hospital iMed API

On approve/reopen this backend calls the hospital's iMed API
(`IMED_API_BASE`; locally the sibling repo `../imed-mock-api`, which also
documents that contract). Frontends never call it directly.
