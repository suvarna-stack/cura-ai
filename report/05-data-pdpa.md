# Chapter 5 — Data & PDPA

The "no cloud transmission" claim in this chapter was verified against the
code, not assumed (§5.3). PDPA requirements are summarised from published
sources retrieved on 18–20 September 2026 and cited inline. Every open
compliance question is stated as open rather than smoothed over.

## 5.1 What data this demo actually uses: synthetic only

**Every case a coder can currently open in this system is synthetic.** No
real patient was ever involved in building or demonstrating this project.
This is not a caveat buried in a README — it is the explicit, stated design
of the one script that owns the demo dataset,
`imed-mock-api/scripts/generate_demo_data.py`:

> *"This script is the ONE source of that bulk data. It is deterministic
> (fixed RNG seed), so re-running it reproduces byte-identical rows, and it
> is idempotent: it deletes everything it previously generated before
> rebuilding."*

Key facts about how the synthetic dataset was actually built, direct from
the script's own docstring and code (`imed-mock-api/scripts/
generate_demo_data.py`):

- **Fixed random seed (`20260821`)** — the same script run twice produces
  byte-identical data, which is what makes the demo repeatable and auditable
  (a reviewer can regenerate the exact same dataset from the same script).
- **Grows a small hand-written seed (21 visits) to 150 visits — 140 OPD
  and 10 IPD admissions**, specifically to exercise the hospital's own
  paging limits (the read contract refuses more than 20 visit ids or a
  31-day window per request — Chapter 4, §4.1) and to show the three coding
  states side by side at a realistic scale.
- **Clinical vocabulary is copied from real sources, not invented**: the
  script's own docstring states it draws department/ward names, document
  types, and the ICD-10-TM coding rules it must respect (one principal
  diagnosis only; routine work like dressing a wound or an injection is
  *not* coded) directly from `docs/medical-glossary.md` and the hospital's
  real API contract PDF. ICD codes used are checked against the real
  `icd_10`/`icd_9` catalog before use, and lab values are deliberately keyed
  to match each scenario's principal diagnosis, "because the coder and the
  AI both read the panel as evidence" — i.e., the synthetic charts are
  designed to be *internally clinically consistent*, not just
  structurally valid rows.
- **No patient names exist anywhere in the data model.** This is not a
  redaction step applied to real data — the hospital's own extract never
  exports a patient name field in the first place, and the API contract
  documents `patient` as permanently `null` with the note *"no real
  patient-name source exists"* (`medcode-api/docs/api-contract.md`,
  `CaseCard` field table). The one patient identifier present, **HN**
  (hospital number), is described in the glossary as *"the patient's
  permanent id at this hospital... Not a national ID"*
  (`docs/medical-glossary.md`, §3) — and even that field is `null` on every
  OPD dashboard row today, because the OPD extract this system's dashboard
  reads does not carry it (`api-contract.md`, `hn` field note).

**Honest framing for this report:** this is a strength for a hackathon
deliverable (no real PDPA exposure exists yet, no consent question exists
yet) and simultaneously the reason nothing in Chapters 1, 6, 7 or 8 can cite
a real accuracy, throughput, or user-satisfaction number — every one of
those would have to come from real hospital data or a real pilot, neither
of which has happened (Chapter 8 makes this the top item on the deployment
gap list).

## 5.2 What changes for a real deployment: de-identification, consent, PDPA

Moving from synthetic demo data to real patient charts is not a
configuration change — it triggers Thailand's **Personal Data Protection
Act (PDPA)**, the country's comprehensive data-protection law (enacted 2019,
fully effective since 1 June 2022). The requirements below are summarized
from currently published guidance (retrieved 2026-09-18); none of them have
yet been checked against this specific system's design by a qualified
compliance reviewer — see §5.5.

- **Health data is "sensitive personal data," requiring a stronger legal
  basis than ordinary personal data.** Thailand's data protection committee
  (PDPC) explicitly lists health data, alongside financial and biometric
  data, as sensitive personal data. Processing it generally requires
  explicit consent, **or** falls under a narrower set of exceptions —
  necessary for medical purposes, public health, or scientific research,
  each subject to appropriate safeguards such as data minimization, access
  controls, and security measures. Which basis this system's intended use
  (hospital-internal coding operations) falls under is a legal
  determination for the hospital's counsel or DPO; this report does not
  make it (§5.5, item 2).
  — *Tilleke & Gibbins, "Thailand Issues Guidelines on PDPA Consent and
  Notification Requirements"*, accessed 2026-09-20.
  [https://www.tilleke.com/insights/thailand-issues-guidelines-on-pdpa-consent-and-notification-requirements/](https://www.tilleke.com/insights/thailand-issues-guidelines-on-pdpa-consent-and-notification-requirements/)
- **Data subject rights**: access, rectification, erasure, and portability
  must all be honored for a real patient's data. This system's current
  "erasure" mechanism (§5.4) does not satisfy this — it restores a shared
  demo baseline, it does not selectively delete one person's record.
  — *Tilleke & Gibbins, "Thailand's Public Consultation on Proposed PDPA
  Guidelines: Key Updates"*, accessed 2026-09-20.
  [https://www.tilleke.com/insights/thailands-public-consultation-on-proposed-pdpa-guidelines-key-updates/45/](https://www.tilleke.com/insights/thailands-public-consultation-on-proposed-pdpa-guidelines-key-updates/45/)
- **Data minimization.** The current design already leans this direction by
  accident of the hospital's own extract (no patient name, no national ID
  are ever sent — §5.1) — but this needs to be a deliberate, reviewed
  policy for production, not an artifact of what the hospital's OPD extract
  happens to omit today.
- **Retention limits.** No retention period has been defined anywhere in
  this project. The team's own production checklist already states this
  plainly: *"How long we keep the record of approvals... We store this, but
  no rule says how long to keep it. Your medical records policy decides. We
  follow it"* (`medcode-api/docs/DEPLOYMENT-PREP.md`, §2). This is an open
  item, not a solved one.
- **Cross-border transfer restrictions.** Personal data may only be sent
  outside Thailand to jurisdictions with adequate protection, or under
  specific safeguards/consent. This directly shaped the local-RAG
  architecture decision in Chapter 2, §2.3, and the team's own deployment
  notes cite Thailand's data regulator (PDPC) as having published a draft
  healthcare-specific guidance document and flagged this exact issue for
  hospitals evaluating cloud AI compute located outside the country
  (`medcode-api/docs/DEPLOYMENT-PREP.md`, "Sources checked," citing a PDPC
  consultation on healthcare data-protection guidance).
  — *HLC / Chambers, "Thailand PDPC Consults on First Healthcare-Specific
  Data Protection Guideline"*, accessed via `DEPLOYMENT-PREP.md` sources,
  2026.
  [https://www.hlc.com/en/publications/thailand-pdpc-consults-on-first-healthcarespecific-data-protection-guideline](https://www.hlc.com/en/publications/thailand-pdpc-consults-on-first-healthcarespecific-data-protection-guideline)
- **Breach notification and enforcement posture.** Current guidance
  describes a short notification window to the regulator following
  awareness of a personal-data breach, and administrative fines that can
  reach into the millions of Thai baht for serious violations. Guidance
  published in 2026 also names **healthcare** explicitly as one of the
  PDPC's priority sectors for investigation this year.
  — *pacmap.dev, "Thailand Personal Data Protection Act (PDPA) — Enhanced
  Enforcement Phase"*, accessed 2026-09-18.
  [https://pacmap.dev/regulation/th-pdpa-enforcement-2026](https://pacmap.dev/regulation/th-pdpa-enforcement-2026)
  ; *Chambers and Partners, "Data Protection & Privacy 2026 - Thailand"*,
  accessed 2026-09-18.
  [https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/thailand/trends-and-developments](https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/thailand/trends-and-developments)
  These are secondary sources, so this report deliberately quotes no
  specific notification deadline or fine amount; the statute itself and the
  hospital's legal counsel are the authority for those figures.
- **DPO appointment.** Organizations processing personal data at scale,
  especially sensitive categories like health data, typically need a
  designated Data Protection Officer under PDPA.
  — *Tilleke & Gibbins, "Thailand's New Draft Guidance on Data Protection
  Officers"*, accessed 2026-09-20.
  [https://www.tilleke.com/insights/thailands-new-draft-guidance-on-data-protection-officers/](https://www.tilleke.com/insights/thailands-new-draft-guidance-on-data-protection-officers/)
  Whether the partner hospital already has a DPO who would cover this
  system's data flows is a hospital governance question the engineering
  team cannot answer; it is listed as open in §5.5.

## 5.3 How data is stored today, and what was verified (not assumed)

The claim that no patient-chart data leaves the hospital's own
infrastructure in the current design was **checked against the code**,
not simply asserted from the README:

- **Databases.** One `postgres:18` container holds both application
  databases (`medcode`, `imed`), matching the intended production shape —
  "one Postgres server holds both databases... matching the GCP deploy
  plan" (`medcode-stack/README.md`, "The database").
- **The RAG vector index and generation model run locally.** The vector
  store (Chroma) is a persistent on-disk store inside the `rag` service's
  own data volume (`RAG/app/config.py`, `ragdata` volume in
  `medcode-stack/README.md`). Generation is either fully in-process
  (`transformers`, CPU) or via **Ollama running on the host machine itself**
  — explicitly chosen over an in-container/cloud setup for latency and GPU
  reasons (Chapter 4, §4.2.4), not for privacy — but the privacy property
  falls out of the same decision: nothing about generation crosses the
  hospital's own network boundary.
- **A direct code search for external cloud AI API calls (OpenAI,
  Anthropic, Google, AWS Bedrock, Azure OpenAI) across `RAG/app`,
  `medcode-api/src/main`, and `audit-chart-frontend/src` found none.** The
  only "OpenAI" references in the codebase are two doc-comments noting that
  the chat message role convention (`role: "user"/"assistant"`) follows the
  same shape OpenAI's API popularized — not an actual call to any OpenAI
  service (`RAG/app/models/schemas.py:70`,
  `audit-chart-frontend/src/features/agent/types/agent.types.ts:71`).

What the AI service actually receives was checked the same way, in
`medcode-api`'s `CaseSuggestService` and `AgentController`:

| Call | Sent to the AI service | Not sent |
|---|---|---|
| Code suggestions | the chart's report-section text, complaint and present illness first, capped at 3,500 characters | visit number, hospital number, case id, account |
| Agent chat | the coder's question and prior turns | case id, patient identifiers, account token |
| Taught rules | the rule text, plus the teaching coder's name and account id (for authorship checks) | patient data |

One honest caveat: chart text is sent as written. If a clinician typed an
identifier into a note, it reaches the AI service unscrubbed — still on the
local machine, but not filtered.

**What this verification does *not* cover**: network egress at the
infrastructure/firewall level (this was a source-code check, not a running
network trace), and any future production configuration that might
introduce a cloud dependency the current demo build does not have. A real
deployment's PDPA review (§5.5) should re-verify this claim against the
actual production infrastructure, not just this report's source read.

## 5.4 How data is disposed of today — and why that is not the same as PDPA "erasure"

The only "delete" mechanism that exists today is **`POST /api/demo/reset`**:
it restores both the `medcode` and `imed` databases to a previously
snapshotted baseline, truncating and refilling every baselined table
(`medcode-api/docs/api-contract.md`, `POST /api/demo/reset`). This is
reached from the coder UI via **Settings → Reset demo**
(`imed-mock-api/DEMO-SETUP.md`, step 6). It is gated off by default outside
local development (`DEMO_TOOLS_ENABLED`, forced `false` in the container
build), because it is a destructive bulk write requiring authentication
even when enabled.

**This is a demo convenience, not a PDPA-compliant erasure mechanism**, and
this report states that gap explicitly rather than implying reset "handles"
data disposal:

- It restores **everything** to a shared baseline — there is no way to
  erase one specific patient's record while leaving the rest of the
  database intact, which is what a real data-subject erasure request would
  require.
- It is a *reset to a snapshot*, not a *deletion* — a snapshot itself
  persists the data it was taken from; "erasing" via reset does not reduce
  what has been retained anywhere upstream (backups, the snapshot schema
  itself, journaled audit history).
- No retention-period logic exists anywhere in the schema (§5.2) — nothing
  currently deletes a case automatically after N days/years.

## 5.5 Explicit gap: no PDPA compliance review has been done

**This is stated plainly because it is a real, current gap, not a
formality:** no production PDPA compliance review, Data Protection Impact
Assessment (DPIA), or legal sign-off has been performed for this system.
The team's own production-readiness checklist already reaches the same
conclusion independently: *"Data protection paperwork — a processing
agreement, a record of what data we handle, and an impact check for the AI
part. Thailand's data regulator published a draft guide for hospitals this
year. It does not add new rules, but it shows how hospitals will be
checked. Doing it now is cheaper than fixing it later"*
(`medcode-api/docs/DEPLOYMENT-PREP.md`, §2, tagged `🟡 [say]` — a decision
the hospital, not the engineering team, must drive).

Concretely, before any real patient data is processed by this system, the
following must happen and currently have not (carried forward into Chapter
8's deployment gap list, not duplicated here in full):

1. A Data Protection Impact Assessment covering the AI-suggestion pathway
   specifically (since it involves automated processing of sensitive health
   data, even with a human-approval gate).
2. A determined, documented lawful basis for processing (consent vs. one of
   the medical-purpose exceptions — §5.2).
3. A data processing agreement between the hospital (as data controller)
   and whoever operates/hosts this system (as processor, if these are
   different legal entities).
4. A defined, PDPA-compliant retention and erasure policy, replacing the
   demo-reset mechanism (§5.4) with real per-record capabilities.
5. Confirmation of the hospital's own DPO's sign-off, and — because this
   system stores an audit trail of *who* coded *what* and stamps individual
   coder accounts — a review of whether the coder-attribution data itself
   (Chapter 4, §4.3) needs its own retention/access policy as employee data,
   separate from the patient data it is attached to.

**No number, deadline, or compliance status is claimed in this report** for
any of the five items above — they are open, and are re-listed as such in
Chapter 8.
