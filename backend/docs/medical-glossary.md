# Medical glossary — the terms this project actually uses

Plain-language reference for the medical vocabulary in medcode-api.

**Scope is this project.** Everything below is either (a) taken from this repo's
code, its `docs/`, or the real values in the `medcode` database (queried
2026-07-28), or (b) published Thai/international standards that explain those
values — sourced at the bottom. Sections 5 and 8 lean on the external sources;
everything else is grounded in our own data.

Three honest limits:

- Where a term is a **project rule** (something we invented or ported from the
  POC) it says so. Those are not clinical standards — see §11.
- Where a meaning is a **best reading, unconfirmed**, it says that. Don't harden
  an unconfirmed reading into code or docs.
- None of this makes anyone a coding authority. Which code belongs on a chart is
  a certified human coder's call under the rules in §5; this system stores,
  checks and forwards their decision.

---

## 1. The job this software supports

A hospital visit produces doctors' notes, lab results, drugs and procedures.
Afterwards a **medical coder** reads the chart and assigns standard codes saying
what the illness was and what was done. Those codes drive the hospital's
reimbursement claim to whoever is paying — in this data, a Thai government
scheme (§8).

**Why an audit tool exists.** For inpatient care Thai hospitals are paid by
**DRG** (diagnosis-related group): the codes place the admission in a group,
each group carries a **relative weight (RW)**, and payment is roughly RW × a
rate per weight. Because codes move money, two failure modes get watched:
under-coding (the hospital loses money it earned) and **"DRG creep" /
upcoding** — coding that inflates the weight. The NHSO audits medical records
against the submitted codes for exactly this, targeting records that look odd:
procedures unrelated to the principal diagnosis, implausibly high complexity,
very short stays, or RW above 5. A 2015 NHSO audit covered ~119,000 records,
checking principal diagnoses in discharge summaries against the coded data.

That review — is the principal diagnosis right, is a diagnosis missing, is the
paperwork complete — is what this dashboard supports. Our coder reviews cases,
edits codes, and **approves**; approval sends the final code list back to the
hospital system. (DRG applies to admissions; our dashboard data is currently
OPD, so no DRG value exists on our side — see §4.)

## 2. People

| Term | Meaning here |
|---|---|
| **Coder** | The person assigning/reviewing codes. Our `coder` role; stamped on approvals from their logged-in account. |
| **Admin** | Manages accounts (`admin` role). The frontend's "SuperAdmin" is this. "Senior Coder" was a frontend mistake — no such role. |
| **Doctor / attending** | Writes the chart. We never model them as users; they appear only inside note text and in iMed's `doctor_eid`. |

## 3. A "case" — one patient visit

Our `cases` row **is one hospital visit** — not a person, not an episode of
illness.

| Term | What it means | Where |
|---|---|---|
| **Visit / encounter** | One time a patient came to the hospital. | `cases` |
| **Transaction number** | The hospital's id for that visit. Our `case_id`, iMed's `visit_id`. | `cases.case_id` |
| **HN (hospital number)** | The patient's permanent id at this hospital — same person, same HN, every visit. Not a national ID. | `cases.patient_ref`, API `hn` |
| **OPD (outpatient department)** | Came in, was seen, went home the same day. `encountertype = "0"`. | Whole dashboard is OPD today |
| **IPD (inpatient department)** | Admitted to a bed overnight or longer. `encountertype = "1"`. | |
| **AN (admission number)** | The id of an inpatient stay. We don't store it; its *presence* in the hospital extract is what makes a case IPD (`SyncRules.encounterType`). | |
| **Admission datetime** | When the inpatient stay started. Empty on OPD rows — why the API's `created_at` is null for most dashboard cases. | `cases.admissiondatetime` |
| **Discharge datetime** | When the patient left. Same OPD caveat → `updated_at`. | `cases.dischargedatetime` |
| **Ward** | The physical inpatient unit ("อายุรกรรมทั่วไป" = general medicine ward). Empty for OPD. | `cases.ward` |
| **Department** | The clinic/specialty that saw the patient. | `cases.department` |
| **Ageyear** | Age as `"years,months,days"`, e.g. `"65,2,13"` — not a number. | `cases.ageyear` |

**Discharge type / status** — how a stay ended, free text from the hospital.
Real values here: `dischargetype` = `With Approval` (doctor agreed) ·
`Against Advice` (patient left despite advice). `dischargestatus` = `Improved` ·
`Not Improved` · `Normal Delivery` (uncomplicated birth) · `Normal child
discharged separately` (the baby is its own case).

## 4. The codes

Two systems, two tables (`icd_10`, `icd_9`); `case_codes` points at exactly one
per row.

- **ICD-10** — the WHO's diagnosis codes: *what was wrong*. Letter + digits:
  `I10` (essential hypertension), `E11.9` (type 2 diabetes), `N18.5` (end-stage
  kidney disease). The first letter is the **chapter**, roughly a body system —
  I circulatory, J respiratory, N genitourinary, and so on.
- **ICD-9 / ICD-9-CM** — older procedure codes: *what was done*, e.g. `39.95`
  (hemodialysis), `93.35` (heat therapy). We keep it because that's what the
  hospital sends.
- **ICD-10-PCS** — a US procedure system. Not in our data; appears only as a
  string the `PUT …/codes` parser reads as "this is a procedure".

**Code role** (`case_codes.code_role`) — the job each code does:

| Our role | Hospital's word | Plain meaning |
|---|---|---|
| `principal_diagnosis` | `PRIMARY_DIAGNOSIS` | The main reason for the visit. Exactly one (§5). |
| `secondary_diagnosis` | `COMORBIDITY` | Another condition the patient also has that affects care. |
| `other` | `OTHERS` | Present but not driving this visit. |
| `external_cause` | `EXTERNAL_CAUSE_OF_INJURY` | *How* an injury happened, never the injury itself. ICD-10 chapters V–Y. |
| `procedure` | — | An ICD-9 row: something that was done. |

**Source** (`case_codes.source`) — `imported_from_imed` (from the hospital) vs
`coder_assigned` (our coder added it). Approve diffs these against the
hospital's live rows.

**DRG (diagnosis-related group)** — the payment bucket an admission falls into,
computed from its codes (§1). We have **no DRG source**: the API serves the
static `"—"`, and `revenue_impact` is null.

**Watch out — our code tables hold more than their names suggest**, because
Thailand codes on its own national modification (§5). `icd_9` carries 7-digit
Thai traditional-medicine procedure codes (`7217811` royal-style Thai massage,
`7217820` herbal compress, `9991959` cupping, `7A41800` acupuncture) and
`icd_10` carries Thai U-codes (`U57.33`, `U78.257`) with Thai descriptions.
Also, descriptions in this data are the hospital's own shorthand
(`DLP (Dyslipidemia)`, `Essential HT`), not official ICD titles — which is why
`KnowledgeCodeSyncService` fills blank descriptions but never overwrites
existing ones.

## 5. The Thai coding rulebook (ICD-10-TM)

Thailand doesn't use raw WHO ICD-10. It uses **ICD-10-TM** (Thai Modification),
which adds national codes and ships as five volumes: diagnosis tabular list,
diagnosis index, procedure tabular list, procedure index, and **Volume 5, the
Standard Coding Guidelines** — the rules below. Knowing them tells you what our
coders are actually judged against.

**Principal diagnosis** — the rules are strict, and several are things a
naive tool would get wrong:

- There can be **only one**.
- It's the **final** diagnosis at the end of treatment, and it may differ from
  the diagnosis on arrival.
- It must be a condition the patient **already had before admission**.
- With several candidates, pick the **most severe**; if equally severe, the one
  that **consumed the most resources**.
- Read the whole record but treat the **discharge summary** as the primary
  source.
- **Never change the doctor's wording** — if the record is too vague to code
  precisely, use sex/age/history/exam findings to refine, and ask the doctor if
  in doubt.
- For dagger/asterisk pairs, the **†** code is the principal diagnosis and the
  **\*** code becomes a secondary one.
- Childbirth, HIV and cancer cases have their own special rules.

**Comorbidity vs complication vs other diagnosis** — Thai guidelines separate
three things our schema collapses into two:

| | Comorbidity | Complication | Other diagnosis |
|---|---|---|---|
| When did it arise | before admission | **after** admission | either |
| Severity | enough to require extra investigation/care | enough to require extra care | not enough to require extra care |
| Typical | chronic | acute | minor |
| Count | 0..n | 0..n | 0..n |

All three **must be written down by the treating doctor**, and — an explicit
rule worth remembering — **you may not turn a lab result into a diagnosis**. An
abnormal white-cell count is not "bacterial infection" unless the doctor
concluded so. Anything AI-assisted in this product has to respect that: a
suggestion from labs alone is a prompt for the doctor, never a code.

> Our `code_role` has **no `complication`** value; the hospital sends
> `COMORBIDITY`, which we store as `secondary_diagnosis`. So our data cannot
> currently distinguish "had it on arrival" from "developed it in hospital".
> That's a real modelling gap, not something to paper over.

**Procedures** — one **main operation/procedure for the principal diagnosis**
(done in a major operating room by a trained doctor; if several, the most
important one wins and the rest become additional), optionally one main
procedure for the comorbidity/complication, then **additional procedures**
(any number, needn't be in an OR). Routine work — dressing a wound, giving an
injection, IV fluids, urinary catheterisation — is **not** coded; significant
non-OR things like lumbar puncture, phototherapy, radiotherapy, induction of
labour and oxygen therapy are.

**Other rules that shape real code lists:**

- **Symptoms and signs** aren't coded when their cause is already coded. Code
  them only when the cause is unknown, the symptom resolved before diagnosis, or
  the patient left/was referred before being diagnosed.
- **Combined codes** — one code covering several conditions, e.g. `K80.0`
  gallstone *with* acute cholecystitis. Use them instead of separate codes.
- **Ambiguous ("catch-all") codes** like `T14.1 Open wound of unspecified body
  region` are discouraged: you can't recover the real diagnosis from them.
- Clinical definitions are pinned down where coders used to disagree — e.g.
  sepsis needs evidence of infection **plus** 3 of 4 systemic signs
  (temperature >38 or <36 °C, pulse >90, respirations >20, white cells >12,000
  or <4,000 or >10% band forms).

**Thai traditional medicine (TTM)** — the part that explains our odd codes:

- Diagnoses live in **U50–U77**, added as a chapter after ICD-10's last chapter.
  Only licensed Thai-medicine practitioners may assign U50–U76. Our `U57.33`
  sits in this range; `U78.257` is just outside the range these sources
  describe — *unconfirmed*, likely a later TTM addition.
- TTM **procedures are 7-digit numeric codes in three parts, where the first
  three digits are the body site**. That decodes our data directly: `7217811`
  (royal-style Thai massage) and `7217820` (herbal compress) share the prefix
  `721`, and both descriptions end "ที่ไหล่, บ่า" — *at the shoulder/upper
  back*. Same site, different treatment.

## 6. The chart — note types and sections

`case_report_sections` is the doctor's writing, split by `documenttype` (which
document) × `fieldname` (which part of it).

**Document types here:** `OPD Record` (an outpatient visit note) · `Admission
Note` (written when an inpatient is admitted) · `Progress Note` (day-by-day
updates during a stay) · `Clinical Summary` (the discharge summary — and per §5
the *primary* source for choosing the principal diagnosis).

| Field | Plain meaning |
|---|---|
| **Chief Complaint (CC)** | Why the patient came, in a line — "abdominal pain, nausea, 4 hours". |
| **Present Illness (PI)** | The story of this problem: when it started, what changed. |
| **Past History** | Previous illnesses and operations. |
| **Family History** | Illnesses that run in the family. |
| **Food-Drug Allergy** | What the patient reacts to. |
| **Physical Examination** | What the doctor found by looking/feeling/listening. |
| **Investigation** | Tests ordered or considered. |
| **Assessment** | The doctor's conclusion — the diagnosis in words. |
| **Plan** | What will be done next. |
| **Progression** | How the patient is changing over time. |
| **Order** | Instructions written (drugs, tests). |
| **Subjective / Objective** | SOAP-note names for the same ideas: what the patient reports vs what was measured. |

`ccpi` in the API is a 120-character preview built from Chief Complaint →
Subjective → Present Illness — a display snippet, not a clinical concept.

## 7. Orders — what was done and given

`case_orders`, bucketed into `order_category`:

- **lab** — blood/urine tests. Common here: **CBC** (complete blood count, the
  basic blood panel) · **Urine Analysis (UA)** · **Electrolyte** (sodium,
  potassium…) · **BUN** and **Creatinine** (kidney function) · **Liver function
  test (LFT)** · **Lipid profile** (cholesterol) · **Glucose (DTX)** (bedside
  fingerstick sugar) · **Glucose (Fasting)** · **HbA1c** (average sugar over
  ~3 months) · **PT (INR)**, **PTT** (clotting speed) · **TSH** (thyroid) ·
  **Gram stain**, **culture and sensitivity**, **hemoculture** (find the
  bacterium and which antibiotic kills it) · **Lactate** (sepsis/shock marker —
  note §5: a lab number alone is not a diagnosis).
- **medicine** — drugs, stored as the pharmacy's full label:
  `AMLODIPINE TAB 5 MG` = drug, form (TAB tablet · CAP capsule · INJ injection ·
  SYR syrup · NB nebuliser · SACH sachet), strength. `[HAD]` marks a
  **high-alert drug** (dangerous if mis-dosed). `od` once daily, `bid` twice
  daily, `puff` inhaler dose.
- **X-ray** — imaging in practice, and **wider than its name**: plain films
  (`Chest PA Upright` standing front view, `Chest AP Portable` at the bedside,
  `KUB` kidney/ureter/bladder film, `Acute Abdomen Series`), plus **CT**,
  **MRI**, **Ultrasound**, **Echo** (heart ultrasound) and even **ECG/EKG** (a
  heart electrical tracing, not imaging at all). The contract's `CT` and `ROIP`
  categories have **zero rows** in this data; CT studies land under `X-ray`.
- **surgery** — procedures, from the hospital's ICD-9 feed.
- **other** — billing items and record results that fit nowhere else. Second
  biggest bucket; not clinically meaningful on its own.

## 8. Who pays — Thai coverage schemes

`cases.coverage_type` → `coverage_types`. Codes are the hospital's own
(`UCS_89_I`, `OFC_O3`); we derive only the **family** (text before the `_`) and
map it to a **payer**. Human labels stay null until the hospital sends its list.

Thailand has three national schemes: **UCS** (~72% of the population), **CSMBS**
for civil servants (~9%), and **SSS** social security for private employees
(~19%). Note our data contains **no SSS rows at all** — worth asking the
hospital about if social-security patients are expected.

| Family | Payer | Meaning | Confidence |
|---|---|---|---|
| `UCS` | NHSO | **Universal Coverage Scheme** — public coverage for the general population ("gold card"), launched 2001, run by the National Health Security Office (สปสช.). | confirmed |
| `OFC`, `VOF` | CGD | **Civil-servant medical benefit (CSMBS)** — officials and their families, paid by the Comptroller General's Department, Ministry of Finance. | `OFC` confirmed; `VOF` a variant, unconfirmed |
| `LGO`, `VLG` | NHSO | **Local government organisation (อปท.)** employee benefit. | `LGO` confirmed; `VLG` a variant, unconfirmed |
| `WEL` | NHSO | Welfare-category entitlement (low-income/elderly/children groups). | unconfirmed |
| `DIS` | NHSO | Disability entitlement. | unconfirmed |
| `SELF_PAY` (`Cashonly`) | SELF | The patient pays. | from our own mapping |
| `FOREIGN` (`foreign`) | — | Foreign patient, no Thai scheme. | from our own mapping |
| `OTHER` | — | Anything unmatched, e.g. `P1027`. | from our own mapping |

The numeric part (`_89`, `_71`) is the hospital's sub-benefit code and the `_I`
suffix is its own distinction — **meaning unknown to us**, and public NHSO
sources don't spell out this hospital's variant. Treat coverage codes as opaque
strings; only family and payer are derived.

## 9. Departments and wards (Thai → English)

Stored Thai-first with an English hint inside. Departments seen: **ER
(อุบัติเหตุและฉุกเฉิน)** emergency · **OPD MED (อายุรกรรม)** internal medicine ·
**OPD PEDIATRIC (กุมารเวชกรรม)** children · **OPD SURGICAL (ศัลยศาสตร์)**
surgery · **OPD ORTHOPEDIC (โรคกระดูกและข้อ)** bones and joints · **OPD E.N.T
(หู คอ จมูก)** ear/nose/throat · **OPD GP (ทั่วไป)** general practice ·
**Rehabilitation (เวชศาสตร์ฟื้นฟู)** recovery therapy · **Labour Room
(ห้องคลอด)** delivery · **WELL BABY (เด็กดี)** healthy-child checks ·
**ส่งเสริมสุขภาพ (PCU)** health promotion / primary care unit · **IPD Ward 11B
(เคมีบำบัด)** chemotherapy. Wards: อายุรกรรมทั่วไป general medicine ·
กุมารเวชกรรม pediatrics · โรคเลือดและมะเร็ง blood diseases and cancer ·
ศัลยกรรมกระดูก orthopedic surgery · โสต ศอ นาสิก ENT · เวชศาสตร์ฟื้นฟู rehab.

Both columns are empty on ~1,100 cases — the OPD extract often carries neither,
which is why the API falls back department → ward → `"—"`.

## 10. Shorthand that appears inside note text

Doctors write in mixed Thai/English abbreviations. These occur in our data:

**Conditions:** `HT` hypertension · `DLP` dyslipidemia (abnormal cholesterol) ·
`DM` diabetes · `CKD` chronic kidney disease (staged 1–5) · `ESRD` end-stage
renal disease (needs dialysis) · `COPD` chronic obstructive pulmonary disease ·
`AE` acute exacerbation (flare-up) · `LRTI` lower respiratory tract infection ·
`ARF` acute respiratory failure · `BPH` enlarged prostate · `OA` osteoarthritis
· `TBI` traumatic brain injury · `CNS` central nervous system · `HBV` hepatitis
B · `hemiparesis` one-sided weakness · `aphasia` loss of language · `sequelae`
lasting after-effects.

**Process words:** `u/d` underlying disease · `Hx` history of · `s/p` status
post (has already had) · `f/u` follow-up · `D/C` discharge · `r/o` rule out
(suspected, being excluded) · `refer in` transferred from another hospital ·
`known case` already diagnosed elsewhere · `conservative treatment` managed
without surgery · `onset` when it started.

**Procedures/devices:** `PCI` coronary stent · `ETT` endotracheal (breathing)
tube · `intubation` inserting it · `NG` nasogastric feeding tube · `craniotomy`
opening the skull · `RT` radiotherapy.

**Exam shorthand:** `E4V5M6` Glasgow Coma Scale (eye/verbal/motor; 15 = fully
awake) · `motor power gr. 5` full strength on a 0–5 scale · `s1s2` normal heart
sounds · `no murmur` no abnormal heart sound · `BS` bowel sounds · `LLQ` left
lower quadrant of the abdomen · `guarding` / `rebound tenderness` signs of
abdominal irritation · `PR` per rectum exam · `Rt.`/`Lt.` right/left.

Recurring Thai fragments: `ก่อนมารพ.` "before coming to hospital" ·
`ติดตามอาการ` "follow up on symptoms" · `นัด` "appointment" · `ปวดท้อง`
"abdominal pain" · `เหนื่อย` "breathless/tired" · `ไม่มี…` "no …".

## 11. Terms that are OUR rules, not medicine

These look clinical but are project inventions — mostly ported [POC]
placeholders in `service/SyncRules.java`. Never present them as clinical fact,
and note where they diverge from §5.

| Term | How it's actually computed |
|---|---|
| **Disease group** | First letter of the principal ICD-10 code → a label (`I` → Cardiovascular, `E` → Endocrinology, `Z` → Factors); no principal code → `"Ungrouped"` (195 cases). A chapter bucket, not a grouping used in medicine, and **not** a DRG. |
| **Severity** (low/medium/high) | Purely a count of secondary diagnoses: 0 low, 1–2 medium, ≥3 high. It does **not** mean the patient is sicker, and it is not the DRG complexity level. |
| **Completeness / missing** | Did the case arrive from the hospital **already coded**? Complete = at sync time the hospital data carried at least one ICD-10 diagnosis AND at least one ICD-9 procedure; anything less is incomplete — the coding work this product queues up. Labels: `icd10`, `icd9`. (Rule changed 2026-08-05; before that it checked chart documentation sections — old labels `chief`, `exam`, `assessment`, `admission_note`, `discharge_summary` may persist on rows not yet re-synced.) |
| **Case status** | `open` → `in_review` → `approved`, or `reopened`. Our workflow, not a hospital state. |
| **Confidence** | Would be an AI score; no source exists, always null. |
| **Incomplete groups** (`surgery`, `ct-x-ray`, `medicine`, `other`) | Dashboard buckets derived from a case's orders, for filtering the work queue. |

## 12. Hospital-side (iMed) terms

From `docs/imed-integration.md`: `visit_id` (= our case id) · `object_id` (their
row id for one code) · `fix_visit_type_id` (OPD/IPD) · `fix_diagnosis_type_id`
(the role) · `fix_operation_type_id` (kind of procedure) · `coder_eid` /
`doctor_eid` (employee ids) · `beginning_diagnosis` / `beginning_operation` (the
text as first written) · `doctor_discharge` (a flag their POST requires — the
open question 3 coupling) · `is_cancelled` (their delete is a cancel flag, and
cancelled rows are filtered out of reads).

## Sources

External material used for §1, §5 and §8 (retrieved 2026-07-28):

- [ICD-10-TM Standard Coding Guidelines, Volume 5](https://www.surinadmin.com/userfiles/file/ICD10-TM-Section_1_Guidelines.pdf) — the principal-diagnosis / comorbidity / complication / other-diagnosis definitions, procedure rules, symptom-code and combined-code rules, sepsis criteria.
- [Development of ICD-10-TM ontology for a semi-automated morbidity coding system in Thailand](https://pubmed.ncbi.nlm.nih.gov/22935742/) — ICD-10-TM as Thailand's modification of WHO ICD-10 (~1,072 added codes).
- [ICD-10-Thai Modification development (Wansa Paoin, APAMI)](https://www.apami.org/apami2006/ppt/1027-WG-ThaiPaoin.pdf) — the five-volume structure.
- [รหัสกลุ่มโรค อาการ และหัตถการด้านการแพทย์แผนไทย (ICD-10-TM), Dept. of Thai Traditional and Alternative Medicine](https://www-old.dtam.moph.go.th/index.php/th/download/10033-dl0148.html) and [HOSxP U77x guidance](https://www.sasukrongkwang.com/hosxp-pcu-manual/) — U50–U77 Thai-medicine diagnosis range, licensing limit on U50–U76, and the 7-digit TTM procedure format whose first three digits are the body site.
- [A qualitative study of DRG coding practice in hospitals under the Thai UCS](https://link.springer.com/article/10.1186/1472-6963-11-71) — DRG creep/upcoding, audit targeting criteria (procedures unrelated to the principal diagnosis, high complexity, short stay, RW > 5).
- [Validity of Principal Diagnoses in Discharge Summaries and ICD-10 Coding Assessments Based on National Health Data of Thailand](https://e-hir.org/journal/view.php?id=10.4258%2Fhir.2017.23.4.293) — the 2015 NHSO audit of ~119,000 records.
- [NHSO profile](https://www.asean-ssa.org/files/Organisation%20Profiles/NHSO%20Thailand.pdf) and [Health Coverage in Thailand (NCBI Bookshelf)](https://www.ncbi.nlm.nih.gov/books/NBK525141/box/ch21.sec5.box2/?report=objectonly) — UCS / CSMBS / SSS shares and who administers each.
- [ตารางประเภทสิทธิย่อย, UC@KKPHO](https://www.uckkpho.com/uc/56/) — scheme code abbreviations UCS / OFC / LGO / SSS. (`WEL`, `DIS`, `VLG`, `VOF` are *not* confirmed by any public source found; ask the hospital.)

---

*Keep this file honest: if the hospital answers an open question or a value
turns out to mean something else, fix it here rather than starting a second
version elsewhere.*
