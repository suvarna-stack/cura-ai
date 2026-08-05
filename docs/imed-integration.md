# iMed write integration — design & open questions

How medcode-api's approve/reopen flow maps onto the hospital's real write API
("iMed Diagnosis and Medical Discharge API", rev 1, 24 Jul 2026), which
supersedes the invented `coding-result` contract. The sibling repo
`../imed-mock-api` mocks this contract field-for-field under `/api/v1` —
production is an `IMED_API_BASE` + `IMED_API_TOKEN` swap.

Decisions taken 2026-07-24 (with the team):

1. **Diff strategy** — on approve, medcode diffs the coder's final code list
   against the hospital's rows: new code → `POST /diagnosis`, changed code →
   `PUT /diagnosis/{visit_id}`, removed code → `DELETE .../icd10|icd9/{id}`.
   This is the API's intended use (POST returns generated `object_id`s; PUT
   requires them; DELETE cancels one row).
2. **Write timing** — the hospital is written ONLY at approve/reopen. Code
   saves while the coder works stay in medcode's own DB.
3. **Reopen** — reverts what approve did: PUT edited rows back to their
   pre-approve values (requires snapshots, see below), DELETE-cancel rows we
   created, clear the coding status.
4. **Old contract** — `PUT/DELETE /api/cases/{tn}/coding-result` is deleted,
   not kept in parallel.

> **Status (2026-07-24): implemented.** Mock side: imed-mock-api `/api/v1`
> (see its README). This side: `ImedWritebackService` (diff + revert),
> `ImedWriteOpsRepository` + `imed_write_ops` journal, reworked
> `ImedApiClient` (Bearer, /api/v1). Everything below remains the reference
> for the field mapping and the still-open hospital questions.

## What medcode-api must store (Phase 2)

| New state | Why |
|---|---|
| `imed_object_id` per code row | PUT/DELETE address rows by the hospital's id. For rows imported from the extract, `medhack_diagnosis_icd10.id` is assumed to BE that id (open question 1). For rows we create, POST returns it. |
| Pre-approve snapshot per edited row | Reopen must PUT the original values back — the API has no "undo", so we keep the before-image. |
| `request_id` per outbound write | The API dedups by it; a retry after a 500 must replay the SAME id to heal without double-writing. Format: `MCAI-<caseId>-<action>-<n>`. |

## Field mapping (our contract → theirs)

### Visit level

| medcode | iMed API | Notes |
|---|---|---|
| `case_id` (transaction number) | `object_id` / `{visit_id}` | Open question 1 confirms these are the same identifier |
| `encountertype` `"0"`/`"1"` | `fix_visit_type_id` | Mock master data: `OPD` / `IPD`; real IDs TBD (open question 2) |
| — | `doctor_discharge` | Always `"1"` per the PDF (open question 3!) |
| — | `doctor_discharge_opd` / `_ipd` | Required per visit type; content source TBD (open question 3) |
| generated | `request_id` | `MCAI-…`, stored for retry replay |

### Per ICD-10 code

| medcode (`CodeEdit` / detail row) | iMed API `diagnosis_icd10[]` |
|---|---|
| stored `imed_object_id` (PUT/DELETE only) | `object_id` |
| `code` | `icd10_code` |
| `desc` | `icd10_description` + `beginning_diagnosis` |
| `diagnosisType` (`PRIMARY_DIAGNOSIS` / `COMORBIDITY` / `OTHERS` / `EXTERNAL_CAUSE_OF_INJURY`) | `fix_diagnosis_type_id` (mock accepts our vocabulary verbatim; real master-data IDs TBD) |
| authenticated coder (Phase 3) | `coder_eid` (open question 4: our accounts ↔ iMed employee ids) |
| constant | `fix_dx_source: "MED_DC"` |

### Per ICD-9 procedure

| medcode | iMed API `diagnosis_icd9[]` |
|---|---|
| stored `imed_object_id` | `object_id` |
| `code` | `icd9_code` |
| `desc` | `icd9_description` + `beginning_operation` |
| `operation_start` (2026-07-30; split on the space) | `date_in` + `time_in` |
| `operation_end` (ditto) | `date_out` + `time_out` |
| `operation_type` (2026-07-30; extract `operationtype` verbatim) | `fix_operation_type_id` when present, else the `GENERAL_OPERATION` placeholder (master data TBD; mock accepts any non-blank) |
| constant | `is_from: "MED_DC"` |

The operation window rides the same never-blank rule as descriptions: sent
only when we hold a value, so approve never erases times the hospital already
has. Sync imports the extract's `startdatetime`/`enddatetime` into
`case_codes.operation_start/_end`; coders can edit them (CodeEdit
`operation_start`/`operation_end`) and the diff treats a changed window as an
update (PUT).

### Coding status (our proposed extension — not in their PDF)

`PUT /api/v1/coding-status/{visit_id}` `{request_id, coding_status,
finalized_at, updated_by}` on approve; `DELETE` on reopen. Backed by the
hospital-side coding-status table they agreed to add. The mock implements it;
the shape is ours to negotiate.

## Open questions for the hospital

1. **Identifiers**: is the extract's `MedHack_Diagnosis(ICD10).id` the same
   identifier as the API's `diagnosis_icd10[].object_id` (and the extract's
   `transactionnumber` the same as `visit_id`)? Everything assumes yes.
2. **Master data**: the ID lists for `fix_visit_type_id`,
   `fix_diagnosis_type_id` (+ mapping to PRIMARY/COMORBIDITY/OTHERS/EXTERNAL
   CAUSE), `fix_operation_type_id`, and the OPD/IPD discharge status/type ids.
3. **Discharge coupling** (biggest one): the PDF requires
   `doctor_discharge: "1"` and a discharge object on every POST — but our
   writes happen at coding approval, typically AFTER the clinical discharge.
   Does the visit already have discharge data by then, and does our POST
   update it or fail on it? Can the discharge object echo their existing
   values? Can `doctor_discharge` ever be `"0"`?
4. **Coder identity**: do our coder accounts get iMed `EMP…` ids for
   `coder_eid` / `doctor_eid`, or one system-level id?
5. **Cancelled rows & reads**: does the extract/read layer already exclude
   cancelled diagnoses? (The mock excludes them.)
6. **Duplicate rule**: the 409 is "same visit and doctor" — with a
   system-level `doctor_eid`, does re-adding a code another doctor already
   entered 409?
7. **Visit lock**: what does a locked visit return, and should we retry?
8. **Read access**: the PDF covers writes only — what serves the 11 extract
   read feeds (and the coding-status read) in production?
9. **Errors**: is there a busy/e-tag style conflict besides 400/401/409/500?
   What status does an unknown `visit_id` return (the mock uses 400
   `invalid_request`)?
10. **UAT**: URL, Bearer-token issuance, and test visits we may write to.
11. **ICD-9 Extension Code**: the coder UI's operation grid has an
    "Extension Code" column (seen in screenshots 2026-07-30) that appears
    nowhere in the write-API PDF fields or the extract we sync. What is it,
    where does it live in the data, and do our diff writes need to carry it
    (or risk dropping it when we PUT a changed row)?
12. **Extract fields for the coder-UI parity ask** (2026-07-30: the hospital
    wants our app to show the same fields as its own coder UI, but the
    extract doesn't carry most of them). Can the diagnosis/procedure feeds be
    extended with: the **doctor** (แพทย์) per code row; the **clinic**
    (คลินิก) per code row and on the ICD-9 detail popup; the **entry
    date/time** (วัน-เวลา) on ICD-10 diagnoses (procedures already have
    start/end); the free-text **Note** per diagnosis and the **remarks**
    (หมายเหตุ) on the ICD-9 popup; the **chronic-disease flag**
    (โรคประจำตัว); and the **recording coder** (เวชสถิติ)? For any that
    become coder-editable on our side, the write API would also need matching
    fields — today it has none of these (notes included), so we treat them
    all as read-only display pending answers. Until then these UI elements
    are deliberately NOT rendered (golden rule: no field without a real
    source).
13. **ICD-10 catalog edition (the All/WHO/TM/CM filter)**: the coder UI
    filters diagnosis codes by catalog edition — WHO original vs the Thai
    modifications (TM) vs CM. Our `icd_10` table is code + description only.
    What catalog source (and edition marking) does the hospital use, or is
    there a code-range rule (e.g. TTM U50–U77) we should apply, so our
    typeahead can offer the same filter honestly?
14. **Lab normal ranges**: the coder UI highlights abnormal lab values
    (yellow). The extract's `medhack_orderlab` sends item values + units but
    no reference ranges, so our lab table (2026-07-30) shows values without
    abnormal marking — inventing our own ranges would be fake clinical
    judgment. Can the extract include the reference range or an abnormal
    flag per item?
15. **Negative drug quantities**: `medhack_orderdrug.quantity` is sometimes
    negative in the extract (e.g. NALBUPHINE `-6` next to positive rows for
    the same drug on the same visit). We ASSUME that's a return/credit row
    and display the value verbatim in the hospital-style Order Entry (CPOE)
    panel (2026-07-31). Is that reading right, and should return rows be
    shown, netted against the ordered quantity, or hidden in a coder-facing
    order list? (Their own CPOE screen shows plain positive quantities.)
16. **Case-list filters: visit window + changed-since (2026-08-05, we built
    both into the mock — this is the production ask)**. Our sync now pulls
    selectively instead of fetching the full visit list every time. The case
    list feed needs, in production:
    (a) a **visit-datetime window** (`from`/`to`, inclusive) — we resolve a
    visit's datetime as `admissiondatetime` when filled, else the
    **YYMMDDHHMMSS we found encoded in positions 4–15 of the transaction
    number** (matches the notes' recorddatetime on every extract visit we
    have. Is that TN format guaranteed, and is `admissiondatetime` filled for
    IPD only?);
    (b) a **`changed_since` filter** — "visits whose data changed after T".
    The mock backs this with an `updated_at` stamp on the diagnosis/procedure
    rows (every create/update/cancel through the write API stamps it; the
    filter takes the newest stamp per visit, floored at the visit datetime).
    In their system the rolled-up "last changed" must also cover new
    notes/labs/vitals landing on the visit, however they track that — a
    modification timestamp, an extract-job stamp, anything visit-level works
    for us. Without (b), a case synced once and coded later on their side
    only reaches us when someone re-pulls its visit window.
