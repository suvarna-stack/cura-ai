# Write-back as built — real bodies, values and behaviour

Source of truth for this file: the code in
`service/ImedWritebackService.java` + `client/ImedApiClient.java` (medcode-api)
and `web/DiagnosisApiController.java` + `web/ApiExceptionHandler.java`
(imed-mock-api). Written 2026-08-11 to fill in the "illustrative" parts of
*MedCode AI Case Data API* §6–8.

> **Status of the evidence.** MedCode AI has never called a real iMed server.
> Every request body below is exactly what our code emits (key order included).
> Every response body below is what **imed-mock-api** returns — our own mock,
> built field-for-field from the hospital's "iMed Diagnosis and Medical
> Discharge API" (rev. 1, 24 Jul 2026). Treat responses as *what we expect and
> code against*, not as production observation.

---

## 1. Real request bodies

### 1.1 W1 — `POST /api/v1/diagnosis`, ICD-10, OPD visit

Headers: `Content-Type: application/json`, `Authorization: Bearer <token>`.

```json
{
  "request_id": "MCAI-OPD2604010645001-1f0c2f0a-3f7d-4b8b-9e2a-6d5c2b1a7f34",
  "object_id": "OPD2604010645001",
  "fix_visit_type_id": "OPD",
  "doctor_discharge": "1",
  "coding_status": "approved",
  "diagnosis_icd10": [
    {
      "icd10_code": "D17.1",
      "icd10_description": "lipoma at back",
      "beginning_diagnosis": "lipoma at back",
      "fix_diagnosis_type_id": "PRIMARY_DIAGNOSIS",
      "fix_dx_source": "MED_DC",
      "coder_eid": "somchai@medcodeai.demo"
    }
  ],
  "diagnosis_icd9": [],
  "doctor_discharge_opd": {
    "fix_opd_discharge_status_id": "Coding Approved"
  }
}
```

### 1.2 W1 — `POST /api/v1/diagnosis`, ICD-9, IPD visit

```json
{
  "request_id": "MCAI-IPD2603310915002-8a1e4d55-2c60-41aa-b0f3-9d7e5a2c4411",
  "object_id": "IPD2603310915002",
  "fix_visit_type_id": "IPD",
  "doctor_discharge": "1",
  "coding_status": "approved",
  "diagnosis_icd10": [],
  "diagnosis_icd9": [
    {
      "icd9_code": "86.3",
      "icd9_description": "excision of lesion",
      "beginning_operation": "excision of lesion",
      "date_in": "2026-04-01",
      "time_in": "07:30:00",
      "date_out": "2026-04-01",
      "time_out": "08:15:00",
      "fix_operation_type_id": "OR Procedure",
      "is_from": "MED_DC"
    }
  ],
  "doctor_discharge_ipd": {
    "fix_ipd_discharge_status_id": "Coding Approved",
    "fix_ipd_discharge_type_id": "IPD_DISCHARGE_TYPE_ID",
    "is_from": "MED_DC"
  }
}
```

**These are complete objects — nothing was trimmed.** The discharge objects
carry exactly the keys shown (the spec's other discharge fields —
`base_doctor_discharge_type_id`, `note`, `reason_admission`,
`physical_examination`, `hospital_course`, … — are never sent; we hold no
source for them and will not invent clinical text).

Notes that matter for the spec text:

- **`object_id` is the visit id**, at envelope level. There is no `visit_id`
  key in the body. On PUT it is also in the path and the mock requires the two
  to be equal.
- **One POST per code system.** The diff runs separately for ICD-10 and ICD-9,
  so a visit with both new diagnoses and new procedures produces **two** POSTs,
  each with the other array empty (`[]`, not absent).
- `icd10_description` and `beginning_diagnosis` (resp. `icd9_description` /
  `beginning_operation`) always carry the **same** value, and both keys are
  **omitted entirely** when we hold no description — we never blank a
  description the hospital already has.
- `date_in`/`time_in`/`date_out`/`time_out` are omitted when we hold no
  operation window, for the same reason (see §5.9).
- Fields in the hospital spec we **never send**: `doctor_eid`, `base_clinic_id`,
  `diagnosis_date`, `diagnosis_time`, `comments`, `is_secret`, `is_chronic`,
  `is_disease_surveillance`, `is_personal_illness`, `patient_id`, `row_index`,
  `extension_code`, `order_item_id`, `beginning_diagnosis_th`,
  `beginning_operation_th`.

### 1.3 `coder_eid` vs `doctor_eid`

- We send **`coder_eid` only**, and only **inside `diagnosis_icd10[]` rows**.
  Never at envelope level, never on `diagnosis_icd9[]` rows, and `doctor_eid`
  is never sent at all.
- Value = the **e-mail of the authenticated MedCode AI account** that pressed
  Approve (e.g. `somchai@medcodeai.demo`). On the reopen path the literal
  string `medcode.reopen` is sent instead.
- This is a placeholder pending the hospital's employee-id list (master-data
  question) — it plugs straight into the same field, no code change.

### 1.4 W2 — `PUT /api/v1/diagnosis/{visit_id}`

Only the array of the kind being edited is present; the other key is absent.

```json
{
  "request_id": "MCAI-OPD2604010645001-c93ab7d1-55e4-4f0a-8b21-0ac6e8f19d72",
  "object_id": "OPD2604010645001",
  "fix_visit_type_id": "OPD",
  "doctor_discharge": "1",
  "coding_status": "approved",
  "diagnosis_icd10": [
    {
      "object_id": "12345",
      "icd10_code": "D17.1",
      "icd10_description": "lipoma at back, upper",
      "beginning_diagnosis": "lipoma at back, upper",
      "fix_diagnosis_type_id": "COMORBIDITY"
    }
  ]
}
```

An ICD-9 update row is `object_id`, `icd9_code`, `icd9_description`,
`beginning_operation`, `date_in`, `time_in`, `date_out`, `time_out` — note it
carries **no `fix_operation_type_id`** (see §5.3).

**Status-only PUT.** When the diff has no code body to send (nothing changed,
or only cancels), and on every reopen that needs no restore, we send one PUT
with no code arrays at all:

```json
{
  "request_id": "MCAI-OPD2604010645001-4d2f8b09-7ac1-4e33-9f5b-2b6c0d81ea37",
  "object_id": "OPD2604010645001",
  "fix_visit_type_id": "OPD",
  "doctor_discharge": "1",
  "coding_status": "open"
}
```

### 1.5 W3 / W4 — `DELETE`

- Path: `DELETE /api/v1/diagnosis/{visit_id}/icd10/{object_id}` and
  `…/icd9/{object_id}`.
- **No request body. No `request_id` anywhere** — not in the body, not as a
  header, not as a query parameter. The only header sent is `Authorization:
  Bearer <token>` (not even `Content-Type`).
- Consequence: cancels are **not** covered by the hospital's `request_id`
  dedup. We rely on cancel being idempotent instead. If the hospital wants a
  `request_id` on cancels, tell us where to put it and we will send it.

---

## 2. Real values behind the "per master data" cells

All of these are MedCode AI placeholders except where noted. Each is a single
constant or a direct pass-through — the hospital's real ids drop in without a
code change (the two discharge ids are already environment variables:
`IMED_DISCHARGE_STATUS_ID`, `IMED_DISCHARGE_TYPE_ID`).

| Field | Values we actually send | Origin |
|---|---|---|
| `fix_visit_type_id` | `"OPD"` (extract `encountertype = "0"`) / `"IPD"` (anything else) | our placeholder |
| `fix_diagnosis_type_id` | `"PRIMARY_DIAGNOSIS"`, `"COMORBIDITY"`, `"OTHERS"`, `"EXTERNAL_CAUSE_OF_INJURY"` | **the hospital's own extract vocabulary** (`medhack_diagnosis_icd10.diagnosistype`) |
| `fix_operation_type_id` | the extract's `operationtype` verbatim — seen: `"OR Procedure"`, `"NON OR Procedure"`, `"OTH"`; when we hold none: `"GENERAL_OPERATION"` | hospital data, with our fallback |
| `fix_opd_discharge_status_id` / `fix_ipd_discharge_status_id` | `"Coding Approved"` | our placeholder — deliberately non-clinical |
| `fix_ipd_discharge_type_id` | `"IPD_DISCHARGE_TYPE_ID"` | our placeholder |
| `fix_dx_source` (ICD-10) | `"MED_DC"` (constant) | from the hospital spec |
| `is_from` (ICD-9 row, IPD discharge) | `"MED_DC"` (constant) | from the hospital spec |
| `coder_eid` | MedCode AI account e-mail; `"medcode.reopen"` on reopen | our placeholder |

Role mapping used to fill `fix_diagnosis_type_id`:

| MedCode AI code role | sent as |
|---|---|
| principal diagnosis | `PRIMARY_DIAGNOSIS` |
| secondary diagnosis / comorbidity | `COMORBIDITY` |
| other | `OTHERS` |
| external cause | `EXTERNAL_CAUSE_OF_INJURY` |
| anything unrecognised | `OTHERS` (fallback) |

ICD-9 rows carry no diagnosis type at all.

---

## 3. Responses (from imed-mock-api — see the banner)

### 3.1 POST/PUT success (200)

```json
{
  "request_id": "MCAI-OPD2604010645001-1f0c2f0a-…",
  "status": "STATUS_SUCCESS",
  "result": {
    "object_id": "OPD2604010645001",
    "diagnosis_icd10": [
      { "object_id": "DX10-9F3A2B7C41DE", "icd10_code": "D17.1" }
    ],
    "diagnosis_icd9": [],
    "doctor_discharge_opd": { "object_id": "DCO-7A2C11B45E90" },
    "coding_status": "approved"
  }
}
```

**Correction for the current PDF draft: there is no flat `result.object_ids`
array.** Generated ids come back **per row, inside `result.diagnosis_icd10[]` /
`result.diagnosis_icd9[]`, as `object_id`** — and MedCode AI's client reads
exactly that shape to journal what it created. `result.object_id` is the
**visit**, echoed back. The discharge object's generated id is echoed under
`doctor_discharge_opd` / `_ipd`.

### 3.2 DELETE success (200)

```json
{
  "status": "STATUS_SUCCESS",
  "result": {
    "visit_id": "OPD2604010645001",
    "object_id": "12345",
    "cancelled": true
  }
}
```

Note this envelope has **no `request_id`** and names the visit `visit_id`
(the POST/PUT envelope names it `object_id`) — an inconsistency worth
resolving in the final spec.

### 3.3 Errors

| Status | Body |
|---|---|
| **400** | `{"status":"STATUS_BUSINESS_ERROR","message":"invalid_request","message_th":"ข้อมูลไม่ครบหรือไม่ถูกต้อง","detail":"<mock-only diagnostic>"}` |
| **401** | `{"message":"unauthorized","message_th":"ไม่มีสิทธิเข้าถึง"}` — note **no `status` key**, unlike the business errors |
| **409** | `{"status":"STATUS_BUSINESS_ERROR","message":"DIAGNOSIS_CODE_ALREADY_EXIST","message_th":"พบรหัส ICD-10 ซ้ำสำหรับ visit และแพทย์เดียวกัน"}` |
| **500** | never produced by the mock; we have no real example |

`detail` is a mock-only debugging aid and is **absent from the real API** by
assumption. The 400 covers everything the mock rejects: missing `request_id` /
`object_id`, `fix_visit_type_id` outside {OPD, IPD}, `doctor_discharge` ≠ `"1"`,
missing/duplicated discharge object, `object_id` present on a POST row, missing
`object_id` on a PUT row, unknown `object_id`, an unknown `fix_diagnosis_type_id`,
a blank `fix_operation_type_id`, an unknown `coding_status` word, and **an
unknown `visit_id`** (open question: the real API may prefer 404 here).

The PDF's §6 sample currently says `DIAGNOSIS_ALREADY_EXIST`; the hospital's own
spec and our implementation both use **`DIAGNOSIS_CODE_ALREADY_EXIST`**.

---

## 4. Formats and behaviour

**`request_id` pattern** — `MCAI-<visit_id>-<random UUID v4>`, one example:

```
MCAI-OPD2604010645001-1f0c2f0a-3f7d-4b8b-9e2a-6d5c2b1a7f34
```

A **fresh id per call**; ids are never reused across retries (see below).

**Paths** — yes, exactly:

```
POST   /api/v1/diagnosis
PUT    /api/v1/diagnosis/{visit_id}
DELETE /api/v1/diagnosis/{visit_id}/icd10/{object_id}
DELETE /api/v1/diagnosis/{visit_id}/icd9/{object_id}
```

Base URL is one configuration value (`IMED_API_BASE`, the host — no
`/api/v1`). Since 2026-11-09 there is no fixed token: `IMED_CLIENT_ID` /
`IMED_CLIENT_SECRET` are traded for a short-lived token at
`POST {IMED_API_BASE}/auth/token` (Basic auth, `grant_type=client_credentials`),
sent as `Authorization: Bearer <token>` on every call, renewed before it
expires and retried once on a `401`.

**Date/time as actually sent** — we store the window as
`"YYYY-MM-DD HH:MM:SS"` and split it on the first space:
`date_in = "2026-04-01"`, `time_in = "07:30:00"` (seconds included). If a
stored value has no time part, `date_in` gets the whole string and `time_in`
is sent as **`null`**. Note this is *not* ISO 8601 with a `T` — the split
shape comes from the hospital's write spec.

**`coding_status`** — fully implemented and sent today, on every POST and PUT:
`"approved"` on approve, `"open"` on reopen, plus the standalone status-only
PUT of §1.4 when the diff has no code body. It is our proposed extension, not
in the hospital's rev.-1 spec; an API that ignores unknown fields is unharmed.

**On 409, on 500, on timeout** — the same thing: **no automatic retry.**

- Timeouts are 5 s connect / 60 s read (`IMED_READ_TIMEOUT_SECONDS`). Any
  failure (409, 5xx, timeout) throws; our own database transaction has
  **already committed** (hospital calls run after our commit, still under the
  write lock), and the coder's request ends in a 502 whose message names the
  hospital's status and route.
- Healing is by **re-running the action, not by replaying the request**: the
  next approve/reopen re-reads the visit's live rows and recomputes the diff,
  so an operation that half-landed converges instead of double-writing. This is
  why a fresh `request_id` is fine — the hospital's dedup is our belt for
  duplicated *network* sends only.
- Call order inside one approve is **cancel → update → create**, so a code
  being created can never collide (409) with a row still queued for cancel.
- Known gap: if we crash between a POST and journaling the ids it returned, the
  created rows exist without our being able to attribute them. A later approve
  heals (it matches by code); a reopen would leave them.

---

## 5. Things that surprised us / spec-vs-reality notes

1. **`result` has no flat `object_ids`.** Created ids arrive per row inside
   `result.diagnosis_icd10[] / diagnosis_icd9[]`. Our journal depends on it —
   if the real API differs, reopen breaks. **Please confirm this shape.**
2. **Two POSTs per case** when a visit gains both new diagnoses and new
   procedures, because the diff runs per code system. If the hospital wants one
   POST carrying both arrays, we can merge it — say so.
3. **`fix_operation_type_id` is create-only.** Our PUT never sends it, so a
   coder changing only the operation type produces no hospital change today.
   We would need to know whether PUT accepts it before wiring it up.
4. **The visit key is `object_id`, not `visit_id`,** in the POST/PUT body — but
   the cancel *response* calls it `visit_id`. Two names for one thing.
5. **`coder_eid` lives inside the ICD-10 row**, not in the envelope, and has no
   ICD-9 equivalent in the spec — so an ICD-9 procedure we create carries no
   record of who coded it.
6. **Every POST is coupled to a discharge object** (`doctor_discharge: "1"` +
   `doctor_discharge_opd`/`_ipd`), even though we write at coding approval,
   after the clinical discharge. This is our biggest open question. Until it is
   answered we send the clearly non-clinical `"Coding Approved"` status id and
   touch nothing else.
7. **iMed has no un-cancel.** Reopening a case that cancelled a row re-creates
   it — with a **new `object_id`**. Any hospital-side reference to the old id
   will not survive a reopen cycle.
8. **`extension_code` exists in the row shape** but appears in no data we
   receive, so our updates never carry it. If iMed clears unsent fields on PUT,
   our updates would silently wipe it — please confirm PUT is a partial update.
9. **`date_in`/`time_in` are marked required, but we omit them** when the
   hospital's own record has no operation time (we never blank a value we do
   not have). If they are strictly required, creating such a procedure would
   fail — please confirm the behaviour, or tell us what to send.
10. **Descriptions follow the same never-blank rule** — omitted rather than
    sent empty.
11. **The current draft's §6 sample field `icd` does not exist.** The real row
    fields are `icd10_code` / `icd9_code`, and those are what we send.
