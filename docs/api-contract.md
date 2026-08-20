# medcode-api — API contract

**This document is the source of truth for the MedCode AI backend API.** The
next frontend is built against it (TypeScript mirror: [types.ts](types.ts)).
Any change to a response shape must update this file, `types.ts`, and
`CasesApiIntegrationTest` in the same commit.

Base URL: the backend origin (local dev `http://localhost:8001`). All bodies
are JSON. CORS: `ALLOWED_ORIGINS` env (`*` by default).

Running locally, `/swagger-ui.html` serves an interactive console for trying
these endpoints out. Its examples are trimmed copies of what's below, kept for
convenience — when the two disagree, **this document wins**.

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
- **Errors**: `400` / `404` / `401` / `403` / `409` / `429` return
  `{"error": "<message>"}`. `500` (e.g. the hospital iMed call failed after our
  commit) returns Spring's default error body; the triggering action is
  idempotent — retry it.
- **Auth** guards the whole API except `POST /api/auth/login`, the health
  probes, and Swagger — every case / approve / sync / demo endpoint needs a
  Bearer token (any active account); `/api/admin/**` additionally requires the
  `admin` role. See the Authentication section.

## Endpoints

### GET /api/health
`{"ok": true}` — no DB touch.

### GET /api/healthz
`{"ok": true, "cases": <int>, "db": "pg"}` — real `COUNT(*)`; liveness check.

### GET /api/cases — the dashboard payload

Cached in-process; rebuilt after any approve / reopen / demo-reset. Lists
**OPD visits only** (`encountertype = '0'`).

The four case collections are **mutually exclusive** — every case appears in
exactly one of `complete`, an `incompleteGroups` group, `reopened` or
`finished`; `stats.total` is their sum.

```jsonc
{
  "stats": { "total": 1101, "complete": 777, "incomplete": 296, "reopened": 3, "finished": 25 },
  "complete":  [ <CaseCard>, ... ],          // complete, not yet approved
  "incompleteGroups": [                       // sorted by size desc, then label
    { "id": "medicine",                       // "surgery" | "ct-x-ray" | "medicine" | "other"
      "label": "Medicine Group",
      "total": 123,
      "cases": [ <CaseCard + missing>, ... ] },
    ...
  ],
  "reopened": [ <ReopenedCard>, ... ],        // reopened, awaiting re-approval
  "finished": [ <FinishedCard>, ... ]         // approved queue
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
| `orderNames` | `object` | `{category: [distinct order names A–Z]}`, same key order as `orders` — the items behind each count (feeds the dashboard's nested Study/Item filter). A category whose rows are all nameless is absent; `{}` when the case has no orders |
| `created_at` | `string \| null` | `cases.admissiondatetime` (raw hospital text). OPD rows lack it → currently always `null` here |
| `updated_at` | `string \| null` | `cases.dischargedatetime` — same caveat |
| `revenue_impact` | `null` | no real DRG/revenue source exists |
| `missing?` | `string` | **incomplete-origin rows only** (incomplete groups + reopened rows that came from one): human-readable labels joined with `", "`, else `"—"` |

**ReopenedCard** = CaseCard for a human-reopened, not-yet-reapproved case
(`demo.reset` reopens don't count). These rows live ONLY in the top-level
`reopened` list — they leave `complete`/`incompleteGroups` until re-approved
(since 2026-07-24; before that the flag rode along inside those lists). Extra
fields:

| Field | Type | Source / meaning |
|---|---|---|
| `reopened` | `true` | always present on these rows (and only here) |
| `reopenedAt?` | `string` | reopen `at` (`YYYY-MM-DD`) from the audit trail, when known |
| `reopenedBy?` | `string` | real reopening actor id, when known |
| `missing?` | `string` | kept when the case's origin was an incomplete group |

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
                  "code_role": "…", "source": "imported_from_imed|coder_assigned",
                  "operation_start": "YYYY-MM-DD HH:MM:SS|null",   // procedure time window —
                  "operation_end": "YYYY-MM-DD HH:MM:SS|null",     // ICD-9 rows only, always null on ICD-10
                  "operation_type": "OR Procedure|NON OR Procedure|OTH|…|null"
                  }, ... ],   // ^ the extract's operationtype verbatim — ICD-9 rows only, null on ICD-10
  "orders":   [ { "order_category": "…", "imed_source": "…", "order_name": "…",
                  "ordered_at": "…",
                  "detail": { "…": "…" }             // the raw hospital order row (order_detail
                  }, ... ],                          //   JSONB) verbatim — keys differ per
                                                     //   imed_source (dosage_signature/quantity on
                                                     //   drugs, panel_name/item_name/value/unit on
                                                     //   labs, …); null when no source row stored.
                                                     //   NOTE: these are the hospital's OWN field
                                                     //   names, so they changed with the R1-R6
                                                     //   contract (2026-08-19). Rows synced before
                                                     //   that keep the old extract names
                                                     //   (panelname/itemname/…) until re-synced —
                                                     //   read new-or-old, as the frontend does.
                                                     //   Category-grouped, max 50 rows PER
                                                     //   category (a global cap starved late
                                                     //   categories on lab-heavy cases)
  "orderCounts": { "lab": 402, "medicine": 112 },    // true per-category totals for THIS case —
                                                     //   orders[] is capped, these are not
  "vitals":   [ { "measured_at": "YYYY-MM-DD HH:MM:SS|null", "temperature": "36.5",
                  "systolic": "119", "diastolic": "80", "heart_rate": "98",
                  "oxygen_saturation": "97", "weight": "65", "height": "157"
                  }, ... ],   // hospital vital-sign readings, chronological (nulls first);
                              // every value raw hospital text or null (blank → null)
  "history":  [ { "action": "approved_single", "coder": "demo.coder",
                  "at": "2026-07-20 09:00:00",
                  "detail": { "by": "demo.coder", "codes": 1 } }, ... ],  // coder audit trail, oldest first
  "codeEdits": <CodeEdit[] | null>,   // last PUT …/codes payload, echoed verbatim
}
```

`history` is this case's slice of the coder audit trail (`coding_history`),
**oldest first** — one entry per coder action (`approved_single` /
`approved_group` / `approved_all` / `reopened` / `code_assigned`); `demo.reset`
churn is excluded, as in `coders`. `coder` is the acting account id/email
(`""` when unrecorded), `at` is `YYYY-MM-DD HH:MM:SS`, and `detail` (present
only when non-empty) is the raw `action_detail` object (e.g. `{by, at, codes}`).
The array is empty when the case has no coder actions yet. The next frontend's
per-case "View History" merges these server rows (read-only — another coder's
action isn't this coder's to undo) with its own browser-local activity log.

### PUT /api/cases/{caseId}/codes — save the coder's working code list

Request: a **bare JSON array** of `CodeEdit` (stored verbatim, echoed back as
`codeEdits`). Fields the backend interprets at approve time:

```jsonc
[ { "code": "E11.9",          // skipped if empty or "???"
    "type": "ICD-10",         // any label matching /icd[- ]?9|pcs/i → ICD-9 procedure;
                              // everything else → ICD-10 (default). The UI's verbose
                              // labels ("ICD-9 Primary Diagnosis", "Comorbidities",
                              // "ICD-10 Comorbidity") are accepted; role from the label:
                              // "…external…" → external cause of injury, "…comorbid…" →
                              // secondary, "…other…" → other, else first ICD-10 =
                              // principal, rest secondary
    "desc": "Type 2 diabetes",
    "note": "internal coder note",  // NOT interpreted: stored + echoed verbatim like any
                              // extra field, shown only in our UI — never sent to iMed
                              // (the hospital write API has no note field)
    "origin": "manual",       // "manual" | "hospital" | "ai" — where the row came from.
                              // NOT interpreted: stored + echoed verbatim like `note`.
                              // The UI groups each code column by it and shows a
                              // confidence % on "ai" rows only; ABSENT on payloads
                              // saved before 2026-08-07, which the UI infers instead
    "missing": false,         // truthy → row skipped at approve
    "selected": true,         // the coder ticked this code for approval. Explicit
                              // false → row skipped at approve. ABSENT → approved
                              // (legacy payloads saved before the checkbox UI)
    "operation_start": "2026-04-02 23:55:00",  // ICD-9 rows only: the procedure's time
    "operation_end": "2026-04-03 05:05:00",    // window, written to iMed on approve
    "operation_type": "OR Procedure"           // ICD-9 rows only: extract vocabulary
                              // ("OR Procedure" / "NON OR Procedure" / "OTH");
                              // blank → null, ignored on ICD-10 rows
  }, ... ]                    // extra fields are stored + echoed, not interpreted
```

`operation_start`/`operation_end` are interpreted at approve time on ICD-9
(procedure) rows only — they land in `case_codes` and go to the hospital as
`date_in`/`time_in`/`date_out`/`time_out`. Accepted formats:
`YYYY-MM-DD HH:MM[:SS]` and datetime-local's `YYYY-MM-DDTHH:MM` (normalized to
`YYYY-MM-DD HH:MM:SS`; unparseable values degrade to null, like the rest of
the edit parsing). The UI treats the window as required and pre-fills "now";
the backend stays lenient because hospital-synced rows may lack times.
`operation_type` rides along the same way: stored on the ICD-9 `case_codes`
row at approve and sent to iMed as `fix_operation_type_id` when present
(absent → the `GENERAL_OPERATION` placeholder, unchanged behavior).

`selected` (2026-08-07) carries the coder's pick. The UI no longer asks coders
to delete the suggestions they don't want — they tick the ones they do — so a
row with `"selected": false` stays in the working state (visible, editable,
re-tickable) but is NOT written at approve. A row with no `selected` key at all
is approved, so payloads saved before this flow behave exactly as they did.
One guard: if a payload's rows are ALL unselected, approve falls back to
re-confirming the imported principal diagnosis — the same behavior as a case
with no saved edits — because that shape means "nobody reviewed this case"
(the UI saves RAG suggestions as soon as a case is opened, and cases can be
approved in bulk from the list). Deleting every row still approves nothing.

Responses: `{"ok": true}` · `400` (not an array) · `404` (unknown case).
Working state never invalidates the dashboard cache and survives reopen.

### POST /api/cases/approve

Request `{"ids": ["<case_id>", …]}`. The acting coder is the **logged-in
account** (a body `coder` field is ignored — see Authentication). For each
existing case: the saved `codeEdits` become real coder-assigned codes (no
edits → the imported principal diagnosis is re-confirmed), the case is
finalized, and the results are sent to the hospital's iMed API. Response:

```jsonc
{ "ok": true,
  "approved": ["<case_id>", …],
  "notFound": [],
  "stats": { "cases_finalized": 1, "status_rows": 1,
             "coder_codes_created": 1, "mcai_code_rows": 1 } }
```

`400` when `ids` is missing/empty/non-strings. Our DB commits first, then the
hospital calls run; if a hospital call fails the request 500s with our side
committed — **approve again** to heal (the hospital diff recomputes against
live state). `stats.mcai_code_rows` = hospital code writes made by the diff
(creates + edits + cancels; see "Downstream" below).

### POST /api/cases/{caseId}/reopen

No meaningful request body (a `coder` field is ignored; the actor is the
logged-in account). Reverses an approve on both sides; the coder's saved
edits are KEPT. Response `{"ok": true}` · `404` unknown case. Same
500-then-retry semantics as approve.

### POST /api/demo/snapshot

No request body. Freezes the CURRENT state of both databases as the demo
baseline: every medcode table is copied into the `demo_baseline` schema
(replacing any previous baseline), and imed-mock-api is told to snapshot the
hospital DB the same way (`imed_baseline` schema, its mock-only
`POST /api/demo/snapshot`). Run once when both sides look exactly how the
demo should start. Response
`{"ok": true, "medcodeTables": {<table>: <rowCount>…}, "imedTables": {…}}`.

### POST /api/demo/reset

No meaningful request body (legacy `baselineCoder` is ignored). Restores BOTH
databases to the snapshotted demo baseline: truncates + refills every
baselined medcode table from `demo_baseline` **except `users` — accounts and
their sessions survive a reset** (accounts added or edited after the snapshot
are kept as-is; a baseline account is re-created only if it was deleted since
the snapshot, because restored audit rows reference it; serial sequences
re-aligned), invalidates the cases cache, then tells imed-mock-api to restore
the hospital DB (undoing every write-back since the snapshot). Two-phase like approve: our side commits first, so a
hospital-side failure 500s with medcode already reset — re-running heals.
Response `{"ok": true, "medcodeTables": {…}, "imedTables": {…}}` ·
`409` if no snapshot was ever taken.

Both demo endpoints are gated by `DEMO_TOOLS_ENABLED` (default `true` locally,
forced `false` in containers): when disabled they return
`404 {"error": "not found"}`, as if they didn't exist. They are destructive
bulk writes (and, like the rest of the case surface, require a token), so
production ships with them off.

### POST /api/sync — pull case data from the hospital

Request body optional. With no body (or an empty object) fetches every case
the hospital's iMed API exposes; with a window it pulls only the cases whose
**visit datetime** falls inside it:

```jsonc
{ "from": "2026-07-22",            // optional; YYYY-MM-DD or "YYYY-MM-DD HH:MM[:SS]"
  "to":   "2026-07-25" }           // optional; either side may be omitted
```

Bounds are inclusive and filtered by the hospital server-side; a date-only
bound covers the whole day (`from` → 00:00:00, `to` → 23:59:59). The visit
datetime is the hospital's rule: `admissiondatetime` when the extract filled
it, else the datetime encoded in the transaction number. A malformed bound is
`400 {"error": "<field> must be YYYY-MM-DD or YYYY-MM-DD HH:MM[:SS]"}`. Note
the window selects by when the patient VISITED, not by when hospital data last
changed — the hospital list also supports `changed_since` (its `updated_at`
stamps) but medcode does not expose that yet.

Loads the fetched cases into medcode. **Non-destructive** (safe to re-run) —
per case:

- **new** (unknown to medcode) → full import;
- **open** → hospital-sourced data refreshed (the `cases` clinical columns,
  sections, orders, and `imported_from_imed` codes are replaced), while coder
  work is KEPT — `coder_assigned` codes, saved `codeEdits`,
  `case_status`, and existing history are never touched (a `case_synced`
  history row is only appended);
- **already finalized** (`case_status` not `open`) → **skipped**, left intact,
  so a sync can never silently invalidate an approved coding.

Reads the hospital only (no write-back). Runs under the single-writer lock, so
it briefly blocks approve/reopen. Response:

```jsonc
{ "ok": true,
  "imported": ["<case_id>", …],         // newly created
  "refreshed": ["<case_id>", …],         // existing open cases re-pulled
  "skippedApproved": ["<case_id>", …],   // finalized, left untouched
  "failed": [ { "caseId": "<case_id>", "error": "<message>" }, … ],
  "stats": { "cases": 0, "sections": 0, "codes": 0, "orders": 0,
             "chunks": 0, "vitals": 0, "coverageTypes": 0, "catalogCodes": 0 },
  "window": { "from": "2026-07-22", "to": "2026-07-25" } }
  // "window" echoes the request bounds (null for an omitted side) and is
  // ABSENT entirely on an unwindowed sync — the old shape is unchanged.
```

Before the per-case loop, sync also mirrors the hospital's ICD reference
catalogs (R4/R5, `GET /api/v1/catalog/icd10` and `.../icd9` on the iMed API)
into this database's `icd_10`/`icd_9` tables — insert new codes, fill blank
descriptions, never overwrite an existing description. `stats.catalogCodes`
counts the rows that changed.

How the cases are fetched (unchanged on the wire, but worth knowing): the iMed
contract has no "download everything" endpoint, so a **windowed** sync calls
R3 (`/api/v1/cases/sync-by-period`) once per ≤31-day chunk, and an
**unwindowed** one calls R1 (`/api/v1/cases/check`) from the epoch for the id
list and pulls it through R2 (`/api/v1/cases/sync`) in ≤20-id batches. Both
are preceded by the R6 contract check, which fails the run with a `500` naming
any field the hospital has stopped serving — before anything is written.
`document_chunks` is populated for future retrieval but has no reader today.

### POST /api/cases/{caseId}/sync — sync one case from the hospital

No request body. Same non-destructive rules as `POST /api/sync`, scoped to one
transaction number; same response shape (arrays hold at most that one id).
`404` when the hospital doesn't expose that case.

### POST /api/cases/{caseId}/suggest-codes — RAG code suggestions

No request body. Builds a clinical narrative from the case's report sections
(diagnosis-ish sections first, capped at 6000 chars) and asks the RAG knowledge
index for ICD-10 diagnosis and ICD-9 procedure candidates.

**Writes nothing.** The coder accepts or edits the suggestions in the UI, then
saves them with `PUT /api/cases/{caseId}/codes` — this endpoint never touches
`case_codes` or history.

```jsonc
{ "caseId": "8700123456",
  "codes": [ { "code": "S82.6", "system": "ICD-10",
               "description": "Fracture of lateral malleolus",
               "confidence": 88,          // 0-100; 70 when RAG sends none
               "source": "icd10_vol1" } ],  // indexed document; may be null
  "mode": "plain",        // RAG retrieval mode ("graph" | "plain")
  "hitsUsed": 8,          // retrieved chunks the suggester saw
  "clinicalChars": 1240 } // length of the narrative sent to RAG
```

`code` and `system` are always present — a candidate missing either is dropped.
`description` and `source` may be null. A case whose sections hold no usable
text short-circuits to a **200** with `codes: []`, `mode: "none"` and both
counters `0` — not an error.

`404 {"error": "not found"}` for an unknown case. Depends on the RAG service
(`RAG_API_BASE`), so like `/api/admin/knowledge/**` it fails with a `500` when
RAG is unreachable and translates RAG-side 4xx into `400 {"error": "…"}`.

### GET /api/icd-codes — catalog typeahead

Backs the coder UI's code pickers (the Edit / Add-code modals). Query params:

| param    | required | notes |
|----------|----------|-------|
| `q`      | yes      | matched case-insensitively against **code or description** (substring) |
| `system` | no       | `ICD-10` or `ICD-9` (case-insensitive); omitted → both are searched |
| `limit`  | no       | default `20`, capped at `40` |

Returns a **bare array**, best matches first — exact code match, then code
prefix, then everything else; ties break on `code`, then `system`:

```jsonc
[ { "code": "J18.9", "system": "ICD-10", "description": "Pneumonia, unspecified organism" },
  … ]
```

`description` is `""` rather than null when the catalog row has none. `400
{"error": "q is required"}` for a blank `q`, `400 {"error": "system must be
ICD-10 or ICD-9"}` for any other system value.

Since the 2026-07-28 split this reads the `icd_10` and `icd_9` tables (one
`icd_codes` table before then); `system` in the response says which one a row
came from, and a code may legitimately exist in both.

### GET /api/analytics — the Analytics page payload

One request serves the whole page; every figure is a roll-up over **OPD visits
only** (`encountertype = '0'`), the same population `GET /api/cases` serves.
Query params:

| param      | required | notes |
|------------|----------|-------|
| `days`     | no       | length of the `casesOverTime` window, ending today. Default `30`, capped at `365` |
| `topCodes` | no       | rows in `topCodes`. Default `10`, capped at `50` |

```jsonc
{
  "summary": {"total": 21, "complete": 4, "incomplete": 16, "reopened": 0, "finished": 1},
  "casesOverTime": [ {"iso": "2026-07-22T00:00:00", "count": 1}, … ],
  "coverageCounts": [ {"label": "OFC", "count": 5}, … ],
  "topCodes": [ {"label": "D17.1 · lipoma at back", "count": 2,
                 "code": "D17.1", "system": "ICD-10",
                 "description": "lipoma at back"}, … ],
  "documentationGaps": {
    "items": [ {"key": "icd10", "label": "ICD-10 diagnosis codes", "count": 16}, … ],
    "byGroup": [ {"label": "Cardiovascular", "incomplete": 4, "total": 6}, … ]
  },
  "codingActivity": [ {"iso": "2026-07-22T00:00:00", "approved": 2, "coded": 3, "reopened": 0}, … ],
  "turnaround": {"medianMinutes": 95, "p90Minutes": 480, "cases": 5},
  "codingDepth": {
    "uncoded": 3,
    "avgCodesPerCase": 2.2,
    "distribution": [ {"bucket": "0", "cases": 3}, {"bucket": "1", "cases": 8},
                      {"bucket": "2", "cases": 4}, {"bucket": "3-5", "cases": 5},
                      {"bucket": "6+", "cases": 1} ],
    "roleMix": [ {"role": "principal_diagnosis", "label": "Principal diagnosis", "count": 18}, … ]
  },
  "caseMix": {
    "groups": [ {"label": "Cardiovascular", "low": 4, "medium": 1, "high": 1,
                 "other": 0, "total": 6}, … ],
    "sex": [ {"label": "female", "count": 12}, {"label": "male", "count": 9} ],
    "age": [ {"label": "0-14", "count": 2}, {"label": "15-39", "count": 5},
             {"label": "40-59", "count": 6}, {"label": "60+", "count": 8} ]
  }
}
```

- **`summary`** is the dashboard payload's `stats` object *verbatim* (served
  from the same CasesCache), so the Analytics tiles can never drift from the
  Dashboard's counts. `reopened` is its own exclusive queue — only `total`
  covers all four.
- **`casesOverTime`** has exactly `days` points, oldest first, **zero-filled**:
  a day the hospital saw nobody is a `0`, not a missing point. A visit is dated
  by `admissiondatetime`, else by the `YYMMDDHHMMSS` encoded at positions 4-15
  of its transaction number — the same rule imed-mock-api applies to its
  visit-date window, so both systems date a visit identically. A visit that
  matches neither is absent from the series (but still counted in `summary`).
  `iso` is **local midnight with no zone suffix** — a `Z` would render as the
  previous day west of UTC.
- **`coverageCounts`** groups by สิทธิการรักษา *scheme family* (`UCS`, `OFC`,
  `WEL`, …), biggest first — not by raw `coverage_code`, of which the extract
  carries ~40 variants of a handful of schemes. Visits whose coverage the
  extract left blank group under `ไม่ระบุสิทธิ`.
- **`topCodes`** ranks both catalogs together, counting every `case_codes` row
  — imported-from-iMed and coder-assigned alike. `label` is `"code · description"`,
  falling back to the bare code when the catalog has no description;
  `code`/`system`/`description` are the same values unjoined, so a client can
  relabel without parsing.

The five keys added 2026-08-20 (the Analytics-v2 cards; everything above is
the original four-card payload, unchanged):

- **`documentationGaps`** — what incomplete cases are missing. `items` counts
  incomplete OPD cases per missing item (a case missing two things counts in
  both rows); `key` is the raw `missing_detail` token (`icd10` / `icd9` under
  the 2026-08-05 completeness rule, documentation keys on rows synced before
  it), `label` the same human wording the case list's `missing` field uses —
  an unknown key serves raw rather than being dropped. `byGroup` is incomplete
  vs total per disease group, most incomplete first; the blank group reads
  `Ungrouped`.
- **`codingActivity`** — coder actions per day from the audit trail
  (`coding_history`), same `days` window and zero-fill contract as
  `casesOverTime`, dated by when the action happened (NOT the visit date).
  `approved` counts the three approve variants as one; `coded` is
  `code_assigned`; `reopened` is `reopened`.
- **`turnaround`** — sync-to-**first**-approval time over every OPD case with
  both events (a reopened-and-re-approved case keeps its original figure).
  `medianMinutes` / `p90Minutes` are whole minutes, both `null` with
  `cases: 0` until something has been approved.
- **`codingDepth`** — `distribution` buckets every OPD case by how many
  `case_codes` rows it carries: always exactly the five buckets `0` / `1` /
  `2` / `3-5` / `6+`, in that order, zero-filled. `uncoded` is the `0`
  bucket's count (the needs-coding backlog), `avgCodesPerCase` averages over
  all OPD cases (uncoded included; null only when there are no cases at all),
  and `roleMix` counts code rows per `code_role`, biggest first, with a
  display `label` per role.
- **`caseMix`** — the [POC] disease-group × severity table, every group,
  biggest first (the client decides how many rows fit); `other` catches
  severity values outside low/medium/high so `low + medium + high + other =
  total` always holds. `sex` and `age` are visit counts by patient sex (blank
  → `unspecified`) and by age band (`0-14` / `15-39` / `40-59` / `60+`, age
  from `birthdate` as of today; rows with no birthdate are absent).

`400 {"error": "days must be between 1 and 365"}` /
`{"error": "topCodes must be between 1 and 50"}` outside those bounds.

Until 2026-08-06 the Analytics page ran on hardcoded numbers in the frontend
(a `USE_MOCK` flag); this endpoint replaced them, and no mock path remains —
a failed request shows an error state rather than plausible fake figures.

## Authentication

Since 2026-07-25 (Phase 3) auth guards the **whole API surface except**
`POST /api/auth/login`, the health probes (`/api/health`, `/api/healthz`),
and Swagger. That includes every case read/write, sync, and demo endpoint
above — they all answer `401 {"error": "unauthorized"}` without a token.

**Model.** Email + per-account password (BCrypt-hashed, column `password_hash`).
Roles are `coder` | `admin`; the dashboard's "SuperAdmin" persona is the
`admin` role. `POST /api/auth/login` returns an opaque Bearer **token**; send it
as `Authorization: Bearer <token>` on guarded requests. Sessions are stored
server-side (`auth_sessions`) and expire after `SESSION_TTL_DAYS` (default 7);
logout revokes immediately. A bootstrap admin is created at first startup from
`ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD`.

**Guarding.** The case/sync/demo surface requires a valid token (any active
account, either role). `/api/admin/**` additionally requires the `admin` role
(`401` without a token, `403` for a coder token). `/api/auth/me` and
`/api/auth/logout` require a valid token. Login itself is public.

**Actor stamping.** `POST /api/cases/approve` and `POST
/api/cases/{caseId}/reopen` record the **logged-in account** (its email) as
the acting coder in the audit trail and the hospital write-back. A body
`coder` field is still accepted for backward compatibility but **ignored**.

### POST /api/auth/login

Request `{"email": "…", "password": "…"}`. Response:

```jsonc
{ "token": "<opaque bearer token>",
  "user": { "id": 2, "email": "admin@medcodeai.demo",
            "fullName": "Super Admin", "role": "admin" } }
```

`400` when email/password missing. `401` `{"error": "invalid email or
password"}` on unknown email, wrong password, or an inactive account (the
message never says which). `429` `{"error": "too many failed login attempts —
try again later"}` after `LOGIN_MAX_ATTEMPTS` (default 5) failures for the same
email; a successful login clears the count.

### POST /api/auth/logout

Requires a token. Revokes the current session → `{"ok": true}`. Idempotent.
`401` without a valid token.

### GET /api/auth/me

Requires a token. The current account:

```jsonc
{ "id": 2, "email": "admin@medcodeai.demo", "fullName": "Super Admin",
  "role": "admin", "status": "active" }
```

### GET /api/admin/accounts — list accounts (admin)

A JSON **array** of every account (coders and admins), `full_name` order. Each:

```jsonc
{ "id": 3, "fullName": "Naret Pichitporn", "email": "naret.p@hospital.th",
  "role": "coder",              // "coder" | "admin"
  "status": "active",           // "active" | "inactive" | "suspended"
  "createdAt": "2026-07-24 09:12:03",   // backend text, may be null
  "lastLoginAt": null }         // null until first login
```

The "Total Coder Accounts" card counts `role == "coder"`.

### POST /api/admin/accounts — create (admin)

Request `{"fullName", "email", "password", "role"?}` — `role` defaults to
`coder` (must be `coder`/`admin`); `password` ≥ 8 chars, stored BCrypt-hashed.
Response: the created account object (as above, no password). `400` on a
missing/invalid field; `409` `{"error": "an account with this email already
exists"}`.

### PUT /api/admin/accounts/{id} — edit (admin)

Request any of `{"fullName"?, "email"?, "role"?, "password"?}` — a non-blank
`password` re-hashes. Response: the updated account object. `404` unknown id;
`409` if the new email is taken.

### PUT /api/admin/accounts/{id}/status — activate/deactivate (admin)

Request `{"status": "active" | "inactive"}` — the list's toggle. Deactivating
also revokes that account's live sessions. Response: the updated account
object. `400` on a bad status; `404` unknown id.

### DELETE /api/admin/accounts/{id} — delete (admin)

Hard-deletes an account **only if it never did coding work**. An account
referenced by the audit trail is protected: `409` `{"error": "this account has
coding history and cannot be deleted — deactivate it instead"}`. Response on
success `{"ok": true}`. `404` unknown id.

### GET /api/admin/dashboard — dashboard cards (admin)

```jsonc
{ "totalCoderAccounts": 6,     // COUNT(role='coder')
  "activeToday": 3,             // accounts whose last_login_at is today
  "totalCases": 1101,           // COUNT(*) FROM cases
  "systemStatus": "operational" }
```

### /api/admin/knowledge/** — AI Training / RAG proxy (admin)

The admin "AI Training" page. Every route is a thin authenticated proxy to the
MedCode RAG service (the FastAPI app in the sibling `../RAG` repo,
`RAG_API_BASE`, default `http://localhost:8000`); the RAG service itself has no
auth and must only be reachable from this backend. "Training" means indexing
documents (chunk → embed → knowledge graph), **not** fine-tuning model weights.
RAG-side 4xx errors (e.g. a scanned PDF with no text layer) are translated
into the usual `400 {"error": "<detail>"}`; if the RAG service is down these
routes answer `500` with a "RAG API not reachable" message.

| Route | Proxies | Notes |
|---|---|---|
| `GET /api/admin/knowledge/docs` | `GET /documents` | every document with live `status` (`queued`\|`processing`\|`indexed`\|`failed`) + 0-100 `progress`; the page polls this while anything ingests |
| `GET /api/admin/knowledge/stats` | `GET /stats` | `documents_indexed`, `chunks_in_index`, `embed_model`, `llm_model`, `retrieval_mode`, `graph` |
| `POST /api/admin/knowledge/docs` | `POST /documents/upload` | multipart `file` (PDF or CSV, ≤100MB); accepted immediately, ingests in background. Scanned PDFs / empty CSVs / other file types → `400` |
| `DELETE /api/admin/knowledge/docs/{source}` | `DELETE /documents/{source}` | removes chunks from vector store + graph |
| `PATCH /api/admin/knowledge/docs/{source}` | `PATCH /documents/{source}` | `{"filename": "..."}` — renames the display filename only (source id + index untouched, no re-embed); the file extension is preserved, appended when the new name lacks it. Unknown source → `400` |
| `POST /api/admin/knowledge/train` | `POST /documents/rebuild` | wipes + re-ingests everything; `{"status": "rebuilding", "documents": n}` |
| `POST /api/admin/knowledge/retrieve` | `POST /retrieve` | `{"question": "..."}` (+ optional `mode`, `top_k`) → matching chunks, no LLM (fast) |
| `POST /api/admin/knowledge/chat` | `POST /chat` | same body (+ optional `max_new_tokens`, `temperature`) → full LLM answer (slow on CPU) |
| `POST /api/admin/knowledge/sync-codes` | *(nothing — see below)* | scans the indexed documents for code + official-title pairs and upserts them into OUR `icd_10` / `icd_9` catalogs |

Response bodies pass through verbatim from the RAG service (snake_case) — with
one exception. `sync-codes` is **not** a proxy: it reads what RAG has already
indexed and writes to this database's catalog tables, so it answers in our own
camelCase:

```jsonc
{ "documentsScanned": 1, "extracted": 180, "added": 165,
  "descriptionsFilled": 3, "unchanged": 12 }
```

It only ever **adds** codes and **fills blank** descriptions — an existing
description is never overwritten, so re-running is safe and a coding manual
can't clobber titles that came from the hospital.

### /api/agent/chat — coder AI Agent chat

`POST /api/agent/chat` — the cases app's Agent page. **Any valid token**
(either role), unlike the admin-only knowledge surface. A thin proxy to the
RAG service's `/chat`:

```jsonc
// request
{
  "question": "Patient has chest pain and ST elevation, what ICD-9 code?",
  "history": [                       // optional; prior turns, oldest first
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "max_new_tokens": 256              // optional, 16-512, default 256
}
// response — RAG pass-through (snake_case)
{ "question": "...", "answer": "...", "mode": "graph",
  "contexts": [ { "text": "...", "source": "icd9", "display_name": "icd9.pdf",
                  "score": 0.61, "via": "vector match", "metadata": {} } ],
  "unverified_codes": [] }
```

Each context's `source` is the immutable document id; `display_name` is the
current (renameable) display filename — cite that one. `via` is `"exact
match: <code>"` when the chunk was found by literal ICD-code lookup rather
than semantic search (codes named in the question are looked up verbatim and
those chunks lead the list). `unverified_codes` lists ICD codes the answer
mentions that appear in **no** retrieved chunk — surface them as a warning,
never as fact.

### /api/agent/chat/stream — streaming variant (SSE)

`POST /api/agent/chat/stream` — same request body and auth as `/api/agent/chat`,
answered as `text/event-stream`. Events arrive in order:

```jsonc
{ "type": "meta", "mode": "graph", "contexts": [ /* as above */ ] } // first
{ "type": "delta", "text": "The" }        // answer pieces, many
{ "type": "done", "unverified_codes": [] } // terminal
{ "type": "error", "message": "..." }      // terminal instead, on failure
```

Sources arrive before the answer starts, so the UI can render them while the
model is still generating. Because headers are already sent when generation
fails, mid-stream errors surface as the `error` event, not an HTTP status.
Validation errors (blank `question`) still fail fast with a normal `400`.

The server is stateless — the browser owns the conversation and re-sends it
as `history` each call (the proxy keeps the most recent 40 well-formed turns,
dropping malformed entries silently). Answers follow the question's language
(English or Thai — the RAG system prompt enforces it; embeddings are
multilingual so Thai retrieval works against English documents). Blank or
missing `question` → `400`. Like the knowledge routes, RAG-side 4xx becomes
`400 {"error": ...}` and an unreachable RAG service is a `500`.

Latency: the answer comes from a local CPU LLM — tens of seconds normally,
minutes on the first-ever call while the model downloads and loads. Frontends
should show a progress/typing state and must not retry on a slow response.

## Downstream: the hospital iMed API

On approve/reopen this backend calls the hospital's REAL write contract —
"iMed Diagnosis and Medical Discharge API" plus our proposed coding-status
extension (`IMED_API_BASE` + `IMED_API_TOKEN`; locally the sibling repo
`../imed-mock-api`, which mocks it field-for-field). Frontends never call it
directly.

Since 2026-07-24 the write-back is a **diff**: the finalized code set is
compared against the hospital's live rows, then removed codes are cancelled
(`DELETE`), changed codes edited in place (`PUT` by `object_id`), and new
codes created (`POST`, one call carrying the required discharge object).
Every touched hospital row is journaled in `imed_write_ops` with its
before-image; reopen replays the journal in reverse (created→cancel,
updated→restore, cancelled→re-create) and clears the coding status. Both
directions recompute against live state, so retrying a failed action heals.
Full field mapping and open hospital questions: `docs/imed-integration.md`.

`stats.mcai_code_rows` in the approve response now counts hospital code
writes performed by the diff (creates + edits + cancels) — the key name is
kept for compatibility with the pre-diff contract.

Sync (`POST /api/sync`, `POST /api/cases/{caseId}/sync`) is the **inbound**
direction: it reads the hospital's extract tables (`GET /api/cases` and the
per-visit endpoints — cancelled rows already excluded) and loads them into
medcode.
