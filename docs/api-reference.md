# API Reference

The HTTP surface of CURA AI. This is the curated reference: the endpoint
index, the auth model, the error model, the streaming protocol, the hospital
contract and what the AI is sent.

Exhaustive companions sit beside it:

| Document | Audience |
|---|---|
| `backend/medcode-api/docs/api-contract.md` | frontend developers. Every field of every response, and which DB column it comes from. **The contract of record**: when this page and it disagree, it wins |
| `backend/medcode-api/docs/types.ts` | the same contract as TypeScript types |
| `backend/medcode-api/docs/MedCode-AI-iMed-Integration-API-Contract-v1.pdf` | hospital IT. The read contract (R1–R6) we asked the hospital to build |
| `backend/medcode-api/docs/imed-integration.md` | hospital developers. How `medcode-api` calls the iMed API: every route, field and error it relies on |

A live console is at `http://localhost:8001/swagger-ui.html` while the demo
stack runs. It is forced **off** in the container images and turned back on
only by the demo compose file.

**Surface size:** 55 REST operations on `medcode-api` (one of them a
Server-Sent Events stream), 22 on the internal AI service, and the hospital
contract of 6 read and 4 write calls. Counted from the controller annotations,
not from a hand list. `OpenApiDocsTest` fails the build if an endpoint exists
in code but not in the documented list, or the reverse.

---

## Base URLs

| Service | Demo stack | What |
|---|---|---|
| Web UI + API | `http://localhost:8080/api` | **What the browser uses.** nginx proxies `/api` to the backend: same origin, no CORS |
| Backend, direct | `http://localhost:8001/api` | Swagger and `curl` |
| Hospital (iMed) | `IMED_API_BASE` + `/api/v1` | Run by the hospital, not this repo. Called by the backend only |
| AI service | `http://localhost:8000` | Internal. Called by the backend only |

---

## Authentication

Every route needs a token **except** `POST /api/auth/login`, `GET /api/health`,
`GET /api/healthz` and Swagger.

```http
POST /api/auth/login        {"email": "...", "password": "..."}
→ 200  {"token": "<opaque>", "user": {"id": 2, "email": "...", "fullName": "...", "role": "admin"}}

GET /api/cases
Authorization: Bearer <token>
```

`POST /api/auth/logout` revokes the token immediately.

Two roles:

| Role | Reaches |
|---|---|
| `coder` | every case, sync, suggestion, Agent and analytics route |
| `admin` | all of the above **plus** `/api/admin/**`: accounts, the admin dashboard, AI Training, display settings |

The web UI adds a routing rule on top: an admin is sent to the admin console
and cannot open the coding screens. The API itself lets an admin token call
case routes.

> **Tokens are opaque and stored server-side** (`auth_sessions`, as a SHA-256
> of the token) and expire after `SESSION_TTL_DAYS` (default 7). They survive
> a backend restart. Passwords are BCrypt-hashed. Five failed logins for one
> email lock it for 15 minutes (`429`).

**The actor comes from the token, never the body.** Approve and reopen record
the signed-in account as the coder, in our audit trail and in the hospital
write-back. A `coder` field in the body is accepted for compatibility and
ignored.

One account exists after a clean start, created at first boot from
`.env`:

| Email | Password | Role |
|---|---|---|
| `admin@medcodeai.demo` | `admin1234` | `admin` |

**Change it before any deployment.** A WARN is logged whenever the default is
in use. Coders are created by the admin under **Accounts**.

---

## Error model

Errors are one JSON key:

```json
{ "error": "case 87026072711124400801 is being worked on by Somchai" }
```

| Status | Meaning |
|---|---|
| `400` | Bad request: missing or invalid field, malformed date bound, blank search |
| `401` | Missing, expired or revoked token: `{"error": "unauthorized"}` |
| `403` | Valid token, wrong role (`/api/admin/**` with a coder token), or not the owner (another coder's star or taught rule) |
| `404` | Unknown case, account or conversation. Also every demo route when `DEMO_TOOLS_ENABLED` is off |
| `409` | Another coder holds the case lock; the account email is taken; an account with coding history cannot be deleted; no demo snapshot exists |
| `429` | Too many failed logins for this email |
| `500` | Spring's default body. Usually a hospital or AI-service call failed |

> **A `500` from approve, reopen or demo reset means our side already
> committed.** The hospital call runs after our transaction. All three
> recompute against the hospital's live state, so **retrying heals**. It never
> double-writes.

---

## Endpoints

"any" means any valid token (either role). "admin" means the `admin` role.

### Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | — | `{"ok": true}`, no database touch |
| `GET` | `/api/healthz` | — | `{"ok": true, "cases": n, "db": "pg"}`, a real `COUNT(*)`. Use it as the liveness probe |

### Sign-in

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Email and password → token + user |
| `POST` | `/api/auth/logout` | any | Revoke the current token. Idempotent |
| `GET` | `/api/auth/me` | any | The signed-in account |

### Cases: read

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/cases` | any | The dashboard: `stats` plus four mutually exclusive lists: `complete`, `incompleteGroups`, `reopened`, `finished`. **OPD only.** Cached in process |
| `GET` | `/api/cases/{caseId}` | any | One case: the visit row, coverage, chart sections, codes, orders (≤50 per category, plus true totals), vitals, history, the saved working list, star |

### Cases: coding and approval

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/cases/{caseId}/suggest-codes` | any | AI candidates for ICD-10 and ICD-9 from the chart. **Writes nothing** |
| `PUT` | `/api/cases/{caseId}/codes` | any | Save the coder's working list (a bare JSON array, stored verbatim). Local only; the hospital is not touched |
| `POST` | `/api/cases/approve` | any | `{"ids": [...]}`: finalize and **write back to the hospital**. Only ticked rows are written |
| `POST` | `/api/cases/{caseId}/reopen` | any | Undo an approval on both sides. The saved working list is kept |
| `POST` | `/api/cases/{caseId}/lock` | any | Take or renew the case lock (90 s lease; the UI renews every 30 s). Always `200`, with `acquired: true/false` and the holder |
| `DELETE` | `/api/cases/{caseId}/lock` | any | Release your own lock |
| `POST` | `/api/cases/{caseId}/star` | any | Mark important **for everyone**. Only the coder who set it may change it (`403` otherwise). Allowed while another coder holds the lock |
| `DELETE` | `/api/cases/{caseId}/star` | any | Clear your own star |

The working-list rows the backend reads at approve time:

```jsonc
[ { "code": "E11.9",            // skipped if empty or "???"
    "type": "ICD-10",           // /icd[- ]?9|pcs/i → ICD-9 procedure, else ICD-10
    "desc": "Type 2 diabetes",
    "selected": true,           // false → kept on screen, NOT written. Absent → written (old payloads)
    "origin": "ai",             // "manual" | "hospital" | "ai": UI grouping only
    "note": "internal",         // stored and echoed, never sent to the hospital
    "operation_start": "2026-04-02 23:55:00",   // ICD-9 only → date_in/time_in
    "operation_end":   "2026-04-03 05:05:00",   // ICD-9 only → date_out/time_out
    "operation_type":  "OR Procedure" } ]       // ICD-9 only → fix_operation_type_id
```

Every other field round-trips untouched, which is how the UI adds fields
without a backend change.

### Sync from the hospital

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/sync` | any | Pull visits. Optional `{"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"}` on the **visit** date, both ends inclusive. Imports new visits, refreshes open ones and **skips approved ones**. Also mirrors the hospital's ICD catalogs |
| `POST` | `/api/cases/{caseId}/sync` | any | The same for one visit. No UI calls it yet |

Response: `imported`, `refreshed`, `skippedApproved`, `failed[]`, `stats`, and
`window` (only on a windowed sync). Sync holds the single write lock, so it
briefly blocks approve and reopen.

### ICD catalogs

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/icd-codes?q=&system=&limit=` | any | Typeahead over both catalogs. `q` matches code or description; `system` is `ICD-10` or `ICD-9`; `limit` defaults to 20, max 40. Exact code first, then prefix |
| `POST` | `/api/icd-codes/lookup` | any | `{"codes": [...]}` (≤1000) → `{code: description}`. Unknown codes are omitted |

### Display settings

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/case-field-settings` | any | `{"vn": true, "hn": true, "name": false}`: which identifiers the case list shows |
| `PUT` | `/api/admin/case-field-settings` | admin | Change one or more switches. An unknown key or a non-boolean is a `400` and changes nothing |

These switches are **display policy, not access control**. The case payload
still carries the fields, because case detail, search and the audit trail need
them.

### Analytics

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/analytics?days=&topCodes=&from=&to=` | any | The whole Analytics page in one call: summary, cases over time, coverage mix, top codes, top principal diagnoses, coder KPIs, documentation gaps, coding activity, turnaround (median / p90), coding depth, case mix. OPD only. `from`/`to` must come together, span ≤365 days |

### Agent: chat, history and taught rules

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/agent/chat` | any | `{"question", "history"?, "max_new_tokens"?}` → answer + cited contexts + `unverified_codes` + `learned_notes`. Proxies the AI service |
| `POST` | `/api/agent/chat/stream` | any | The same, as Server-Sent Events (below) |
| `GET` | `/api/agent/conversations` | any | Your saved conversations, newest first |
| `POST` | `/api/agent/conversations` | any | `{"mode": "dict"\|"learn", "title"}` → new conversation |
| `GET` | `/api/agent/conversations/{id}` | any | One conversation with every message |
| `POST` | `/api/agent/conversations/{id}/messages` | any | Append turns (normally one user + one assistant) |
| `PATCH` | `/api/agent/conversations/{id}` | any | Rename |
| `DELETE` | `/api/agent/conversations/{id}` | any | Delete. Another coder's id answers `404`, the same as a missing one |
| `POST` | `/api/agent/learn/classify` | any | Is this message a rule to learn or a question? → `{intent, confidence}` |
| `POST` | `/api/agent/learn/extract` | any | Plain-language rule → a structured **draft**. Stores nothing |
| `POST` | `/api/agent/learn/notes` | any | Save a confirmed draft. Editing an existing rule is `403` unless you taught it |
| `GET` | `/api/agent/learn/notes` | any | Every coder's rules, muted ones included |
| `PATCH` | `/api/agent/learn/notes/{noteId}?active=false` | any | Mute or unmute. Author or admin only |
| `DELETE` | `/api/agent/learn/notes/{noteId}` | any | Forget a rule. Author or admin only. An unknown id answers `{"deleted": 0}`, not `403`, so ids cannot be probed |
| `POST` | `/api/agent/learn/match` | any | Which taught rules apply to this text? |

Chat is stateless. The browser owns the conversation and re-sends it as
`history`, and the proxy keeps the most recent 40 turns. `max_new_tokens`
defaults to 320, range 16–512. Answers follow the question's language, Thai or
English.

### Admin: accounts and dashboard

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/accounts` | admin | Every account |
| `POST` | `/api/admin/accounts` | admin | `{fullName, email, password ≥8, role?}`. Role defaults to `coder`. `409` if the email exists |
| `PUT` | `/api/admin/accounts/{id}` | admin | Edit name, email, role or password |
| `PUT` | `/api/admin/accounts/{id}/status` | admin | `active` / `inactive`. Deactivating revokes the account's live tokens |
| `DELETE` | `/api/admin/accounts/{id}` | admin | Only if the account never did coding work. Otherwise `409`: deactivate instead |
| `GET` | `/api/admin/dashboard` | admin | Coder count, active today, total cases, system status |

### Admin: AI Training

A thin authenticated proxy to the AI service. "Training" means indexing
documents; model weights never change.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/knowledge/docs` | admin | Documents with live `status` (`queued`, `processing`, `indexed`, `failed`) and `progress` |
| `POST` | `/api/admin/knowledge/docs` | admin | Upload a PDF or CSV (multipart `file`). Accepted at once, indexed in the background. A scanned PDF with no text is a `400` |
| `PATCH` | `/api/admin/knowledge/docs/{source}` | admin | Rename the display filename and/or set `doc_type` (`icd10`, `icd9cm`). No re-embedding |
| `POST` | `/api/admin/knowledge/docs/order` | admin | `{doc_type, sources[]}`: read-first order within one box. The top document gets a small retrieval boost |
| `DELETE` | `/api/admin/knowledge/docs/{source}` | admin | Remove a document from the index and the graph |
| `POST` | `/api/admin/knowledge/train` | admin | Wipe and re-index everything |
| `GET` | `/api/admin/knowledge/stats` | admin | Documents, chunks, embedding model, LLM, retrieval mode, graph size |
| `POST` | `/api/admin/knowledge/retrieve` | admin | Test retrieval: matching chunks, no LLM |
| `POST` | `/api/admin/knowledge/chat` | admin | Test a full answer |
| `POST` | `/api/admin/knowledge/sync-codes` | admin | Read code + title pairs out of the indexed manuals into **our** catalogs. Only adds codes and fills blank descriptions; never overwrites |

### Demo tools

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/demo/snapshot` | any | Freeze both databases as the demo starting point |
| `POST` | `/api/demo/reset` | any | Restore both databases to that snapshot. Accounts survive. `409` before any snapshot |

Both answer `404` unless `DEMO_TOOLS_ENABLED=true`. It is forced off in the
images, and production must keep it off.

---

## Streaming: `POST /api/agent/chat/stream`

Same body and auth as `/api/agent/chat`, answered as `text/event-stream`.
Events arrive in this order:

| `type` | Payload | When |
|---|---|---|
| `meta` | `mode`, `contexts` (sources), `learned_notes` | first, before the answer starts, so the UI can show sources while the model writes |
| `delta` | `text` | many: one piece of the answer each |
| `done` | `unverified_codes` | terminal, on success |
| `error` | `message` | terminal, instead of `done` |

Headers are already sent when generation starts, so **a failure mid-answer
arrives as an `error` event, not an HTTP status**. A blank `question` still
fails fast with a normal `400`.

Each context carries `source` (the immutable document id), `display_name` (the
current, renameable filename, which is the one to cite), `score`, and `via`.
`via` reads `exact match: <code>` when the chunk was found by literal code
lookup rather than semantic search. `unverified_codes` lists codes the answer
names that **no retrieved chunk contains**: show them as a warning, never as
fact.

---

## The hospital contract (iMed)

What `medcode-api` calls. Frontends never do. The source of truth is the
hospital's own guide, "คู่มือเชื่อมต่อ MedCode กับ Medihack API" (4 Nov 2026).
The hospital builds and runs this API; `medcode-api` finds it through
`IMED_API_BASE` + `IMED_CLIENT_ID` + `IMED_CLIENT_SECRET`.

Auth: `POST /auth/token` with `Authorization: Basic base64(client_id:client_secret)`
and form body `grant_type=client_credentials` →
`{access_token, token_type: "Bearer", expires_in}`. Every other call sends
`Authorization: Bearer <access_token>`. medcode-api renews the token before it
expires and retries once on a `401`. The guide's tokens last 300 seconds; the
hospital's admin issues the client id and secret.

### Read: the five routes the hospital built

R1 (`POST /api/v1/cases/check`, "what changed since T?") was proposed but
parked by the hospital. A sync with no window re-reads saved visit ids via R2
instead.

| # | Call | Answer |
|---|---|---|
| R2 | `POST /api/v1/cases/sync {visit_ids}` | `{cases, not_found}`. **Max 20 ids**, else `422 too_many_visit_ids` |
| R3 | `POST /api/v1/cases/sync-by-period {from, to}` | `{cases}`. **Max 31 days**, else `422 period_too_long` |
| R4 | `GET /api/v1/catalog/icd10` | `[{code, description}]` (no `edition` yet) |
| R5 | `GET /api/v1/catalog/icd9` | same shape |
| R6 | `POST /api/v1/contract/check {required_fields}` | `{valid}` or `{valid: false, missing: [...]}` |

A case is a `visit` block plus nine data blocks (`documents`,
`record_results`, `diagnoses`, `procedures`, `drug_orders`, `lab_results`,
`vitals`, `ward_movements`, `billing_items`). An empty block is `[]`, never
absent. Datetimes are ISO 8601 with `+07:00`, `sex` is `F`/`M`, missing values
are `null` (never `""`), and cancelled code rows never appear. **Every sync
runs R6 first**. If the hospital has stopped serving a field we depend on, the
sync fails with a `500` naming it, before anything is written. Bad bodies are
`400`; an empty `visit_ids`/`required_fields` list or a backwards window is a
`400` too.

### Write: W1–W4

The hospital's write side is still a **mock** on its end: every success
carries `mock: true` and nothing reaches HIS (medcode-api logs this once).

| # | Call | What |
|---|---|---|
| W1 | `POST /api/v1/diagnosis` | Create ICD-10 diagnoses **or** ICD-9 procedures (the other array is `[]`) + the discharge object. New ids come back in `result` |
| W2 | `PUT /api/v1/diagnosis/{visit_id}` | Edit rows by `object_id` (only the array being changed is sent), or only `coding_status`. Only the fields sent change |
| W3 | `DELETE /api/v1/diagnosis/{visit_id}/icd10/{id}` | Cancel one diagnosis: flagged, never deleted, gone from reads. Idempotent |
| W4 | `DELETE /api/v1/diagnosis/{visit_id}/icd9/{id}` | Same for one procedure |

Bodies are snake_case in a `{request_id, status, result}` envelope.
`request_id` is `MCAI-<visit_id>-<UUID v4>`. Any field outside the guide's set
is a `400`; a description goes as a matching pair
(`icd10_description` + `beginning_diagnosis`). Errors: `400
STATUS_BUSINESS_ERROR / invalid_request` and `401 unauthorized` (no `status`
key). The real HIS will also send `409 DIAGNOSIS_CODE_ALREADY_EXIST` and a
visit-lock `403`; the hospital's current write mock does neither yet.

Optional `coding_status` on W1/W2: `"approved"` marks the visit as coded, and
`"open"` clears it on reopen. We proposed it; the hospital's guide now lists it
(its read side still serves `visit.coding_status` as `null`).

Master-data IDs are placeholders until the hospital sends its lists: visit
type `OPD`/`IPD`; diagnosis type `PRIMARY_DIAGNOSIS`, `COMORBIDITY`, `OTHERS`,
`EXTERNAL_CAUSE_OF_INJURY`; operation type (`GENERAL_OPERATION` when none);
discharge status (`Coding Approved`).

**How approve uses W1–W4:** it diffs the coder's final set against the
hospital's live rows (read back through R2), then cancels removed codes (W3,
W4), edits changed ones (W2) and creates new ones (W1), in that order. Every
row touched is journaled with its before-image so reopen can reverse it. See
[`architecture.md` §3](architecture.md#3-approve-a-two-phase-diffed-write).

---

## The AI service (internal)

No authentication. It is meant to be reachable only from `medcode-api`, which
holds the token checks. Listed so the proxy routes above make sense.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` · `/stats` | Status; index and graph counts |
| `POST` | `/suggest` | Case narrative → ICD-10 and ICD-9 candidates. **Retrieval only, no LLM** |
| `POST` | `/retrieve` | Question → matching chunks, no LLM |
| `POST` | `/chat` · `/chat/stream` | Grounded answer from the local LLM |
| `GET` `POST` `PATCH` `DELETE` `PUT` | `/documents`, `/documents/upload`, `/documents/text`, `/documents/{source}`, `/documents/order`, `/documents/rebuild`, `/documents/codes` | The knowledge base |
| `POST` `GET` `PATCH` `DELETE` | `/learn/classify`, `/learn/extract`, `/learn/notes`, `/learn/notes/{id}`, `/learn/match` | Suggest & Learn |

---

## What the AI is sent

Checked against the code (`CaseSuggestService`, `AgentController`), not
assumed:

| Call | Exactly what goes to the AI service |
|---|---|
| Suggestions | `{"clinical_text", "max_per_system": 8}` and nothing else. The text is the chart's report sections, complaint and present illness first, **capped at 3,500 characters**; a section that would overflow is skipped whole, never cut |
| Agent chat | `{"question", "history", "max_new_tokens"}` |
| Taught rules | the rule text, plus `created_by` / `created_by_id`: the **coder's** name and account id, so authorship can be checked |

**No visit number, hospital number, case id or account token is ever sent** with
a suggestion or a chat question. The hospital extract carries **no patient
names** at all. Two honest caveats:

- Chart text is sent as written. If a clinician typed an identifier into a
  note, it goes to the AI service. It is not scrubbed.
- The AI service runs on the same machine or LAN, and the chat model runs in
  local Ollama. Nothing leaves the building in this design. But the service
  itself has no authentication (see
  [`architecture.md` §9](architecture.md#9-known-gaps)).
