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
                  "code_role": "…", "source": "imported_from_imed|coder_assigned" }, ... ],
  "orders":   [ { "order_category": "…", "imed_source": "…", "order_name": "…",
                  "ordered_at": "…" }, ... ],        // max 150, category-grouped
  "history":  [ { "action": "approved_single", "coder": "demo.coder",
                  "at": "2026-07-20 09:00:00",
                  "detail": { "by": "demo.coder", "codes": 1 } }, ... ],  // coder audit trail, oldest first
  "codeEdits": <CodeEdit[] | null>,   // last PUT …/codes payload, echoed verbatim
  "reportDraft": <string | null>      // last PUT …/draft text (feature deprecated)
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
edits/draft are KEPT. Response `{"ok": true}` · `404` unknown case. Same
500-then-retry semantics as approve.

### POST /api/demo/reset

Request `{"baselineCoder": "demo.coder"}` (optional). Restores the demo
baseline: reopens every non-baseline approval and re-finalizes baseline cases
a visitor touched. Response
`{"ok": true, "reopened": <int>, "restoredBaseline": <int>}`.

Gated by `DEMO_TOOLS_ENABLED` (default `true` locally, forced `false` in
containers): when disabled this endpoint returns `404 {"error": "not found"}`,
as if it didn't exist. It's a destructive bulk write (and, like the rest of the
case surface, requires a token), so production ships with it off.

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
