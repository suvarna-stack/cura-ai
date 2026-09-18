# Chapter 1 — Problem

*Status: draft skeleton, grounded in the project's own docs and code. Word count ~1,700 (≈3.5 pages at 500 words/page). Expand with hospital-specific figures once available — see `[TODO]` markers.*

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
system already carrying **some** of its clinical documentation, but a
majority arrive **not yet coded at all**: in the seeded demo dataset that
mirrors the hospital's real extract, roughly half of synced visits are
"incomplete" — missing an ICD-10 diagnosis, an ICD-9 procedure, or both
(`imed-mock-api/DEMO-SETUP.md`: "Sync pulls... 100 OPD cases into medcode,
50 of them already complete"; note the project's glossary is explicit that
"complete" here means the hospital's own data already carried both code
systems at sync time — it does **not** mean a human has reviewed it, see
`docs/medical-glossary.md` §11).

The incomplete backlog is further bucketed by what kind of work drove the
visit — medicine, surgery, CT/X-ray, other — because a coder triaging a
worklist needs to know which cases need which expertise
(`medcode-api/docs/api-contract.md`, `incompleteGroups`). This bucketing
exists precisely because, before this system, there was no single place a
coder (or a coding supervisor) could see the whole uncoded queue, grouped
by type of work, across the hospital's outpatient (OPD) visits.

**[TODO — hospital-specific numbers]**: this report should not state a real
backlog size, average turnaround time, or coder headcount for the partner
hospital, because none of that has been measured yet against real
production data — only against the synthetic demo dataset. Chapter 7
("Results", intentionally left unwritten here — see `eval-results/`) is
where a real measurement belongs, once the hospital shares historical
coding data for comparison (this is explicitly item "Proving the AI is
accurate enough" in `medcode-api/docs/DEPLOYMENT-PREP.md`, §2 — the team
has already flagged that it cannot make this claim without the hospital's
own past-coded visits to compare against).

## 1.4 Why decision support, and not automation

The team's own production-readiness handout is explicit that the product's
value proposition is **assistance, not replacement**: *"A person approves
every code. The AI only suggests. It never writes into the hospital system
by itself. ... The AI cannot make up a code. It does not write codes from
imagination. It searches the coding manuals, takes the codes that actually
appear in them, and shows the text it found them in."*
(`medcode-api/docs/DEPLOYMENT-PREP.md`, "Safety" section). This is not
incidental UI copy — it is enforced in the API contract itself:
`PUT /api/cases/{caseId}/suggest-codes` is documented as writing nothing at
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
