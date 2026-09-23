# Chapter 1 — Problem

This report describes **CURA AI**, built by team Suvarna Stack. The product
was developed under the working name *MedCode AI*, which its repositories,
services and databases still use (`medcode-api`, `medcode-stack`, the
`medcode` database), as do some project documents quoted in this report.

## 1.1 The setting: how a Thai hospital visit becomes a paid claim

Every patient visit at the partner hospital produces a chart: the doctor's notes
(chief complaint, present illness, physical exam, assessment), lab results, drug
orders, procedures, and vital signs. After the visit, a **medical coder** reads
that chart and assigns standardized codes — ICD-10 for *what was wrong*
(diagnoses) and ICD-9 / ICD-9-CM for *what was done* (procedures) — using
Thailand's own national modification of the WHO standard, **ICD-10-TM**, which
adds a fifth volume of coding rules and a block of Thailand-specific codes
(U50–U77 for traditional medicine, among others) on top of the WHO tabular
lists (medcode-api `docs/medical-glossary.md`, §4–5).

Those codes are not paperwork for its own sake. For inpatient (IPD) care, Thai
hospitals are reimbursed by **DRG** (diagnosis-related group): the codes place
the admission into a group, each group carries a relative weight, and payment
is roughly *weight × rate*. Because the codes move money, Thailand's National
Health Security Office (NHSO) audits medical records against submitted codes,
watching for both under-coding (the hospital loses money it earned) and
"DRG creep" / upcoding. A 2015 NHSO audit covered roughly 119,000 records,
checking principal diagnoses in discharge summaries against the coded data
(`docs/medical-glossary.md`, §1, citing the NHSO audit literature listed in
that file's Sources section). Getting the code right is therefore both a
clinical-documentation exercise and a compliance exercise, with real financial
and audit consequences for the hospital.

## 1.2 The manual process this system is built to support

Coding today is a manual, chart-by-chart human task, governed by a strict
rulebook (ICD-10-TM Volume 5) that a naive tool would routinely get wrong.
Some of the rules that make correct coding genuinely hard, not just tedious
(`docs/medical-glossary.md`, §5):

- Exactly **one** principal diagnosis per visit — the *final* diagnosis at
  discharge, which may differ from the diagnosis on arrival, chosen by
  severity and resource use when several conditions compete, and read
  primarily from the discharge summary rather than the admission note.
- Comorbidity vs. complication vs. "other diagnosis" are three different
  things (arose before vs. after admission; enough severity to need extra
  care or not) that the coder must distinguish from free-text doctor notes.
- **A lab result is never a diagnosis** — an abnormal white-cell count cannot
  be coded as "infection" unless the doctor's own note concluded that.
- Catch-all / ambiguous codes are discouraged; combined codes should be used
  where they exist; symptom codes are dropped once the underlying cause is
  coded.

A coder is, in effect, reading unstructured Thai/English clinical text —
including heavy local shorthand (`HT`, `DM`, `s/p`, `r/o`, mixed Thai
fragments — catalogued in `docs/medical-glossary.md` §10) — against a
five-volume national rulebook, for every visit, all day. This is the
process the AI-assisted workflow in this project is built to speed up, not
replace: **"which code belongs on a chart is a certified human coder's call
under [the ICD-10-TM] rules... this system stores, checks and forwards
their decision"** (`docs/medical-glossary.md`, §1, opening scope note).

## 1.3 Where the backlog actually is

The system's own dashboard vocabulary makes the scale of the problem
concrete rather than abstract. A visit arrives from the hospital's iMed
system carrying its clinical documentation, but often without a complete
set of codes. In the seeded demo dataset, which is shaped after the
hospital's real extract, a sync loads **140 outpatient visits, 60 of them
"incomplete"** — missing an ICD-10 diagnosis, an ICD-9 procedure, or both —
and 80 "complete" (counted on the running system, 23 September 2026). The
project's glossary is explicit that "complete" here only means the
hospital's own data already carried both code systems at sync time; it does
**not** mean a human has reviewed the codes (`docs/medical-glossary.md`
§11).

The incomplete backlog is further bucketed by what kind of work drove the
visit — medicine, surgery, CT/X-ray, other — because a coder triaging a
worklist needs to know which cases need which expertise
(`medcode-api/docs/api-contract.md`, `incompleteGroups`). This bucketing
exists precisely because, before this system, there was no single place a
coder (or a coding supervisor) could see the whole uncoded queue, grouped
by type of work, across the hospital's outpatient (OPD) visits.

This report deliberately states **no real backlog size, turnaround time or
coder headcount** for the partner hospital. None of these has been measured
against real production data, only against the synthetic demo dataset, and
inventing them would undermine every measured number in Chapters 6 and 7.
Measuring them needs the hospital's own historically coded visits, which is
the item "Proving the AI is accurate enough" in
`medcode-api/docs/DEPLOYMENT-PREP.md` §2.

## 1.4 Why decision support, and not automation

The team's own production-readiness handout is explicit that the product's
value proposition is **assistance, not replacement**: *"A person approves
every code. The AI only suggests. It never writes into the hospital system
by itself. ... The AI cannot make up a code. It does not write codes from
imagination. It searches the coding manuals, takes the codes that actually
appear in them, and shows the text it found them in."*
(`medcode-api/docs/DEPLOYMENT-PREP.md`, "Safety" section). This is not
incidental UI copy — it is enforced in the API contract itself:
`POST /api/cases/{caseId}/suggest-codes` is documented as writing nothing at
all (`medcode-api/docs/api-contract.md`), and the only path that touches the
hospital's own database is a separate, explicit `POST /api/cases/approve`
call made by a logged-in, audited human account.

The reason this design choice matters for the *problem statement*, not
just the implementation, is that ICD-10-TM coding carries the "never turn a
lab result into a diagnosis" rule and several other judgment calls a
model cannot verify against ground truth on its own (§1.2 above). A tool
that silently auto-codes risks exactly the DRG-creep / under-coding
failure modes the NHSO already audits for (§1.1). The problem this project
solves is therefore narrower and more defensible than "automate medical
coding": it is **"give the coder a faster, better-grounded starting point,
and make the approve/reject decision fast, auditable, and reversible."**

## 1.5 Scope of the current deliverable

Two honest scoping limits, stated because they shape everything that
follows in this report:

- **OPD only, today.** The coder dashboard (`GET /api/cases`) serves
  outpatient visits exclusively (`encountertype = '0'`); the ten IPD
  admissions in the demo dataset are deliberately absent from it
  (`imed-mock-api/DEMO-SETUP.md`). DRG, which is the highest-stakes
  reimbursement mechanism described in §1.1, applies to IPD admissions —
  so the current dashboard's financial impact is narrower than the
  DRG-audit framing above implies. This is a real scope boundary, not an
  oversight to paper over.
- **A hackathon-built system running on synthetic demo data.** Every case a
  coder reviews in the current build was generated by
  `imed-mock-api/scripts/generate_demo_data.py`, not pulled from the real
  hospital's live iMed system (see Chapter 5 for the full data provenance
  and honesty statement). The problem described above is real — it is
  grounded in the hospital's actual coding rulebook, actual API contract,
  and actual workflow vocabulary, as captured across this project's docs
  — but the demonstration of the *solution* has not yet run against real
  patient charts.

## 1.6 Objectives

The deliverable set out to build, and to test as a whole, a system that:

1. **Brings the coding backlog into one worklist.** Pulls outpatient visits
   from the hospital's iMed system and shows which of them still lack an
   ICD-10 diagnosis or an ICD-9 procedure.
2. **Suggests codes grounded in the coding manuals.** Proposes ICD-10 and
   ICD-9 candidates from each chart, taken from the uploaded ICD references,
   with the source shown.
3. **Keeps the coder as the decision maker.** Nothing reaches the hospital
   without an explicit, authenticated approval; every approval is attributed
   and can be reversed.
4. **Writes approved codes back into the hospital's own records** through
   the hospital's API, not a side database.
5. **Keeps patient data inside the hospital.** Retrieval and generation run
   on local models, with no cloud AI service in the loop.
6. **Reaches TRL 4.** The system is tested end to end, on realistic data,
   with measured results.

Chapter 7 judges the results against these six objectives.

## 1.7 Method and timeline

The work ran from 21 July to 23 September 2026 across five repositories
(283 commits in total, per `git log`). The dated milestones below come from
the project's own progress log (`medcode-api/CLAUDE.md`) and commit history.

| Date (2026) | Milestone |
|---|---|
| 21–22 Jul | Backend rebuilt in Spring Boot; the API contract written down; the hospital side split into its own mock service and database |
| 23–24 Jul | Sync from the hospital; staff login and accounts; write-back rebuilt on the hospital's real "iMed Diagnosis and Medical Discharge API" |
| 26–27 Jul | AI (RAG) service started; the new coder web UI wired to the backend |
| 28 Jul – 7 Aug | Catalog split, procedure time windows, hospital-style chart view, accessibility pass, selection-first code review, coding status on the hospital record |
| 15–17 Aug | Streaming Agent chat with the grounding guard; all five services containerised in one compose stack |
| 19–20 Aug | The read contract (R1–R6) written for the hospital and mocked; test suite re-based; Flyway made the single schema source |
| 22–26 Aug | Coder-taught rules with ownership; shared case star; analytics filters |
| 21 Sep | Evaluation run: test suites, load tests, AI accuracy, screenshots |
| 23 Sep | Documentation and final report |
