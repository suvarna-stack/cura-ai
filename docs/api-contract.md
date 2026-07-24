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
- **Errors**: `400` / `404` / `401` / `403` / `409` return
  `{"error": "<message>"}`. `500` (e.g. the hospital iMed call failed after our
  commit) returns Spring's default error body; the triggering action is
  idempotent — retry it.
- **Auth** applies to the admin surface only (see the Authentication section).
  The case/approve/sync endpoints above are unauthenticated.

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

### POST /api/sync — pull case data from the hospital

No request body. Fetches every case the hospital's iMed API exposes and loads
it into medcode. **Non-destructive** (safe to re-run) — per case:

- **new** (unknown to medcode) → full import;
- **open** → hospital-sourced data refreshed (the `cases` clinical columns,
  sections, orders, and `imported_from_imed` codes are replaced), while coder
  work is KEPT — `coder_assigned` codes, saved `codeEdits`/`reportDraft`,
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
             "chunks": 0, "coverageTypes": 0 } }
```

Note: the hospital's list endpoint has no "changed since" filter, so the fetch
pulls the full list; only the writes are selective. `document_chunks` is
populated for future retrieval but has no reader today.

### POST /api/cases/{caseId}/sync — sync one case from the hospital

No request body. Same non-destructive rules as `POST /api/sync`, scoped to one
transaction number; same response shape (arrays hold at most that one id).
`404` when the hospital doesn't expose that case.

## Authentication & admin

Auth guards the **admin dashboard only** — login, account management, and the
dashboard cards. The case/approve/sync endpoints above stay public.

**Model.** Email + per-account password (BCrypt-hashed, column `password_hash`).
Roles are `coder` | `admin`; the dashboard's "SuperAdmin" persona is the
`admin` role. `POST /api/auth/login` returns an opaque Bearer **token**; send it
as `Authorization: Bearer <token>` on guarded requests. Sessions are stored
server-side (`auth_sessions`) and expire after `SESSION_TTL_DAYS` (default 7);
logout revokes immediately. A bootstrap admin is created at first startup from
`ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD`.

**Guarding.** `/api/admin/**` requires a valid token **and** the `admin` role
(`401` without a token, `403` for a coder token). `/api/auth/me` and
`/api/auth/logout` require a valid token (any active account). Login itself is
public. `login` also works for a `coder` account (forward-compatible for the
coming coder frontend); only the admin routes enforce the role.

### POST /api/auth/login

Request `{"email": "…", "password": "…"}`. Response:

```jsonc
{ "token": "<opaque bearer token>",
  "user": { "id": 2, "email": "admin@medcodeai.demo",
            "fullName": "Super Admin", "role": "admin" } }
```

`400` when email/password missing. `401` `{"error": "invalid email or
password"}` on unknown email, wrong password, or an inactive account (the
message never says which).

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

## Downstream: the hospital iMed API

On approve/reopen this backend calls the hospital's iMed API
(`IMED_API_BASE`; locally the sibling repo `../imed-mock-api`, which also
documents that contract). Frontends never call it directly.

Sync (`POST /api/sync`, `POST /api/cases/{caseId}/sync`) is the **inbound**
direction of the same iMed API: it reads the hospital's case tables (`GET
/api/cases` and the per-visit endpoints) and loads them into medcode.
