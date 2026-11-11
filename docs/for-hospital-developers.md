# For hospital developers: what MedCode AI expects from the iMed API

This page is for the team building the hospital side of the connection. It
says, in one place, **what our code calls, when, and what it relies on** — the
things that are true of our code today, checked against it on 2026-11-11.

You host every route. Our backend (`backend/`) is the only caller; we never
expose an endpoint for you to call.

## What to read, in order

1. **This page** — when we call each route, and the behaviour our code depends on.
2. [`docs/api-reference.md`](api-reference.md), section "The hospital contract"
   — every route on one screen.
3. [`backend/docs/MedCode-AI-iMed-Integration-API-Contract-v1.pdf`](../backend/docs/MedCode-AI-iMed-Integration-API-Contract-v1.pdf)
   — our original contract (11 Aug 2026): the case object, field by field.
4. Your own guide, "คู่มือเชื่อมต่อ MedCode กับ Medihack API" (4 Nov 2026). **Where
   it differs from our PDF, your guide wins** and our code follows it: no R1,
   client-credentials login, `+07:00` datetimes, `sex` as `F`/`M`.

Who designed what: the read routes **R1–R6** are our design; the write routes
**W1–W4** are your existing spec, plus one field we asked for, `coding_status`.

## Connecting

| Setting (our `.env`) | Meaning |
|---|---|
| `IMED_API_BASE` | Your host only — no `/api/v1`, no trailing slash |
| `IMED_CLIENT_ID` / `IMED_CLIENT_SECRET` | The client credentials you issue us |

- **Token:** `POST /auth/token` with Basic auth and
  `grant_type=client_credentials`. We reuse the token and renew it 30 seconds
  before `expires_in` runs out.
- **A `401` on any call:** we fetch a new token and send the same request once
  more — the same body, so the same `request_id`. A second `401` is shown to
  the coder as an error.
- **Timeouts:** 5 s to connect, 60 s to read an answer.
- **HTTPS with your own certificate authority?** Tell us — our backend trusts
  only the standard public authorities until we add yours.

## When we call each route

| Coder action | Calls, in order |
|---|---|
| **Sync with a date range** | R6 → **R3 once per day** of the range (`T00:00:00+07:00` to `T23:59:59+07:00`) → R4 → R5 |
| **Sync without dates** | R6 → R2 for every open case we already hold, 20 ids per call → R4 → R5 |
| **Sync one case** | R6 → R2 with that one id → R4 → R5 |
| **Approve a case** | R2 for that visit (to see its live rows), then for diagnoses and then procedures: cancel (W3/W4) → change (W2) → add (W1) |
| **Reopen a case** | R2 for that visit → the calls that undo the approve (see below) |

New cases reach us **only** through R3. We never call anything on a timer:
every call starts from a coder's click.

## Reads: what our code relies on

- **R6 field list.** Before every sync we send the 36 fields our code can't do
  without (`REQUIRED_FIELDS` in
  [`SyncService.java`](../backend/src/main/java/com/medcodeai/api/service/SyncService.java)).
  If any is missing we stop before writing anything. Fields outside that list
  (drug, lab, billing, record-result and ward rows) are stored as you send them
  and shown to coders as-is — a new field there simply appears on screen.
- **`visit.visit_id` is our case id.** Please never change it once issued.
- **`encounter_type`:** `"IPD"` means inpatient; **any other value is treated
  as outpatient**.
- **`diagnosis_type`:** one of `PRIMARY_DIAGNOSIS`, `COMORBIDITY`, `OTHERS`,
  `EXTERNAL_CAUSE_OF_INJURY`, or `null`. We store `null` as "other".
- **The visit date on our case list** is `admission_datetime`. When that is
  `null` (outpatient visits, so far), we read the date out of the transaction-number
  shape of `visit_id` (digits 4–15 = `YYMMDDHHMMSS`). If your `visit_id` won't
  keep that shape, please fill `admission_datetime` for outpatient visits too —
  otherwise those visits show no date.
- **Datetimes** carry `+07:00`. Another offset is converted to Bangkok time.
- **Blocks with no rows** are `[]`; missing values are `null`; R2 lists unknown
  ids in `not_found`. All as your guide says.

## Writes: what the real write-back must do

Today your write routes answer `mock: true` and change nothing. Our approve and
reopen logic depends on the following once they become real. If any of it
can't hold, please tell us before you build — it changes our code, not yours.

1. **Reads show writes straight away.** After W1, R2 must return the new rows
   with the `object_id`s W1 gave back; after W2, the new values; after W3/W4,
   the row must be gone. Approve works out what to send by comparing the
   coder's final codes with what R2 returns. If reads don't change, every
   approve sends the same codes again.
2. **W1 returns the ids it created**, in `result.diagnosis_icd10[].object_id`
   and `result.diagnosis_icd9[].object_id`. We store them so reopen can cancel
   exactly those rows.
3. **One live row per code per visit.** We match your rows to the coder's codes
   by ICD code. We cancel before we update, and update before we create, so a
   duplicate-code `409` should never be triggered by us.
4. **A write is all or nothing.** Codes and `coding_status` in one request
   should land together or not at all. Our side has already saved the coder's
   work when we call you, so after an error the coder simply approves again:
   we re-read R2 and send only what is still missing.
5. **`coding_status`:** we send `"approved"` on approve and `"open"` on reopen.
   When an approve has no code changes, we send a PUT with only
   `coding_status`. Please also serve it back as `visit.coding_status` in R2
   (it is `null` there today).
6. **Errors:** we treat any `2xx` as success and anything else as failure
   (shown to the coder; we don't read the body). For the visit-lock `403` and
   the duplicate `409` in your PDF, send us the exact bodies and we'll show the
   coder a clear message instead of a generic error.

**What reopen sends**, using the record we keep of each approve:
rows the approve created → W3/W4 (only if R2 still shows them); rows it changed
→ W2 back to their old values; rows it cancelled → W1 again (you issue new
ids), with `coder_eid: "medcode.reopen"` and `coding_status: "open"`.

**Values we send until you give us your master data** (all changeable from our
`.env`, no code change):

| Field | We send now | Setting |
|---|---|---|
| `fix_opd_discharge_status_id`, `fix_ipd_discharge_status_id` | `"Coding Approved"` | `IMED_DISCHARGE_STATUS_ID` |
| `fix_ipd_discharge_type_id` | `"IPD_DISCHARGE_TYPE_ID"` | `IMED_DISCHARGE_TYPE_ID` |
| `fix_operation_type_id` | the hospital's own value when we have it, else `"GENERAL_OPERATION"` | — |
| `coder_eid` | the coder's login email (`"medcode.reopen"` on reopen) | — |

## Testing your API against our system

1. In our `.env`, set `IMED_API_BASE`, `IMED_CLIENT_ID` and
   `IMED_CLIENT_SECRET` to your **test** server, then follow
   [the README](../README.md#run-it).
2. Log in, press **Sync**, pick a day that has visits → cases appear.
3. Open a case, tick codes, **Approve** → W1–W4 calls. **Reopen** → the undo
   calls. Our backend log (`docker compose logs -f medcode-api`) shows each failure.
4. The exact bodies we send are pinned by
   [`ImedWritebackGuideTest.java`](../backend/src/test/java/com/medcodeai/api/service/ImedWritebackGuideTest.java),
   and every HTTP call is in
   [`ImedApiClient.java`](../backend/src/main/java/com/medcodeai/api/client/ImedApiClient.java).

Approve and reopen write for real, so use a test server, never production.

Questions still open between us (master data, the period filter's field, rate
limits, and more) are listed in
[`backend/docs/imed-integration.md`](../backend/docs/imed-integration.md#open-questions-for-the-hospital).
