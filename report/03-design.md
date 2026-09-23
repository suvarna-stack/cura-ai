# Chapter 3 — Design

Architecture and data-model facts in this chapter come from the repositories'
own documentation and Flyway migrations, cited inline so each can be checked
against the code.

## 3.1 Workflow: before and after

### 3.1.1 Before (manual, as described in Chapter 1)

1. A visit happens at the hospital; the doctor's notes, labs, orders and
   vitals accumulate in the hospital's own iMed system.
2. A coder — with no dashboard of what needs coding — works through charts,
   reading free-text Thai/English notes against the five-volume ICD-10-TM
   rulebook from memory or a paper/PDF reference.
3. The coder manually looks up candidate codes, cross-checks the coding
   guidelines (§1.2), and enters the final codes directly into the hospital
   system.
4. There is no shared, structured signal for "which visits are missing
   codes" across coders, and no shared record of who suggested/considered
   which code before it was chosen.

### 3.1.2 After (this system)

The same 2-minute pitch the team wrote for judges/hospital stakeholders
compresses this well: *"It takes a patient visit out of the hospital system,
suggests the diagnosis and procedure codes, a human coder checks them and
approves, and the approved codes go straight back into the hospital's own
records"* (`medcode-api/docs/PITCH-2MIN.md`). Step by step, as actually
implemented:

1. **Sync** (`POST /api/sync`) pulls visits from the hospital's iMed system
   into the coding dashboard — either everything, or a date-bounded window —
   and simultaneously refreshes the ICD-10/ICD-9 reference catalogs from the
   hospital's own master list (`medcode-api/docs/api-contract.md`,
   `POST /api/sync`). Visits land in one of four mutually-exclusive
   dashboard buckets: **complete** (arrived already carrying both code
   systems, not yet approved), **incomplete** (missing a diagnosis and/or
   procedure code, grouped by work type — medicine/surgery/CT-X-ray/other),
   **reopened** (a human undid a prior approval), and **finished**
   (approved).
2. **AI suggestion** (`POST /api/cases/{id}/suggest-codes`) — a coder opens
   a case and the system builds a clinical narrative from the chart's report
   sections (capped at 3,500 characters, chief complaint and present illness first)
   and asks the RAG service for ICD-10/ICD-9 candidates with confidence
   scores and a cited source document. This call **writes nothing** — see
   Chapter 4, §4.3.
3. **Human review and selection.** The coder sees candidates grouped by
   *origin* — added by coder, from the hospital record, suggested by AI, not
   documented — with confidence percentages shown **only** on AI-suggested
   rows (a 2026-08-07 design change specifically so a hospital-sourced code,
   which needs no "confidence," is never confused with a probabilistic
   guess; `medcode-api/docs/api-contract.md`, code-role/origin fields). Since
   2026-08-07 the flow is explicitly **selection-first**: nothing is
   pre-ticked except the coder's own manual entries; the coder ticks the
   codes that belong on the case (`selected: true`), rather than the older
   "everything is suggested, delete what's wrong" pattern
   (`medcode-api/CLAUDE.md`, "Selection-first code review" milestone).
4. **Save working state** (`PUT /api/cases/{id}/codes`) — persists the
   coder's in-progress edits to *this system's own database only*; the
   hospital is not touched yet.
5. **Approve** (`POST /api/cases/approve`) — the only action that writes
   back to the hospital. The system diffs the coder's final, ticked code
   list against the hospital's live rows and issues the minimal set of
   creates/updates/cancels needed to match (Chapter 4, §4.1 has the full
   mechanics).
6. **Reopen** (`POST /api/cases/{id}/reopen`) reverses an approval on both
   sides — the coder's edits are kept, only the finalized/approved state is
   undone — using a before-image journal so the hospital's data is restored,
   not just the local copy (`medcode-api/docs/imed-integration.md`,
   "Reopen").

<p align="center"><img src="figures/fig-3-1-workflow.png" alt="Coding workflow before and after"><br><em>Figure 3.1 · The coding workflow before and after this system</em></p>

## 3.2 Architecture: five services, one Postgres, an optional AI

The system is five independently-built, independently-deployable services,
composed for local/demo use by a sixth, code-free repo
(`medcode-stack/README.md`). Figure 3.2 shows how they connect.

<p align="center"><img src="figures/fig-3-2-architecture.png" alt="System architecture"><br><em>Figure 3.2 · System architecture: five containers, the hospital behind one setting, generation on the host</em></p>

| Service | Repo | Role | Host port (compose) |
|---|---|---|---|
| `web` | `audit-chart-frontend` | React + TypeScript + Vite coder UI, built and served by nginx; proxies `/api` to the backend so the browser only ever talks to one origin (no CORS) | 8080 |
| `medcode-api` | `medcode-api` | Spring Boot 4.1 / Java 21 backend. Owns the API contract, the `medcode` database, the single write-lock to the hospital, and the sync/approve/reopen orchestration | 8001 |
| `imed-mock-api` | `imed-mock-api` | Stands in for the hospital's real iMed system, implementing its read (R1–R6) and write (W1–W4, `/api/v1/diagnosis`) contracts field-for-field, against its own `imed` database | 8003 |
| `rag` | `RAG` | FastAPI Python service: embeddings, vector store and retrieval for code suggestions (no language model involved), plus local LLM generation for the coder Agent chat | 8000 |
| `db` | — (stock `postgres:18`) | One Postgres server hosting **both** application databases, `medcode` and `imed` (schema-isolated), matching the target production deploy shape | 5433→5432 |

Two architectural decisions are worth stating explicitly because they shape
everything downstream:

- **RAG is optional by design.** Nothing in the compose file's `depends_on`
  graph requires it, and the rest of the application (loading visits,
  editing codes, syncing, approving, reopening) continues to work with it
  switched off — only AI suggestions, the Agent chat, and the admin
  Training page degrade (`medcode-stack/README.md`, "AI (the RAG
  service)"). This directly supports the human-in-the-loop safety framing
  from Chapter 1 — the coder can always finish their job without the AI.
- **`medcode-api` must run as exactly one instance.** Its write lock
  (`WriteGate`) and its in-process cases cache are held in memory, not in
  the database, so horizontal scaling would corrupt approvals rather than
  share load (`medcode-stack/README.md`, "Production is not this file";
  `medcode-api/CLAUDE.md`, "Layout conventions"). This is a known,
  documented scaling ceiling for the current design, not an oversight — see
  Chapter 8 for how it affects the production deployment gap list.

Figure 3.3 follows one case through the system, from the hospital back to
the hospital.

<p align="center"><img src="figures/fig-3-3-coding-flow.png" alt="The coding flow"><br><em>Figure 3.3 · One case through the system: sync, suggest, save, approve</em></p>

A more detailed, interactive set of data-flow diagrams is maintained with the
code in `medcode-api/docs/dataflow.html`: the system boundary, the
case-coding pipeline, sync, the two commit phases of approve, reopen's
backward replay of the journal, authentication, the four flows through the
RAG service, and a process × table matrix. Two of its views are reproduced
in Appendix B.

## 3.3 Data model

The two databases mirror the two systems they represent — this system's own
coding workspace (`medcode`), and the hospital's own extract-plus-write-API
surface (`imed`) — kept intentionally separate so the hospital's data stays
the hospital's, and this system's working state is disposable relative to it.

### 3.3.1 `medcode` — the coding workspace

Schema evolution is tracked as Flyway migrations
(`medcode-api/src/main/resources/db/migrations/V1`–`V9`), which is itself a
useful design record. Figure 3.4 shows the core coding tables; the full
migration list is in Appendix C.

<p align="center"><img src="figures/fig-3-4-data-model.png" alt="Core data model"><br><em>Figure 3.4 · Core tables of the medcode database</em></p>

- **`cases`** — one row per hospital visit (the "case"); holds hospital-sourced
  clinical fields (department, ward, severity, disease group — several of
  these are explicitly *this project's own derived buckets, not clinical
  facts*, see `docs/medical-glossary.md` §11) plus workflow state
  (`case_status`, an enum of `open`, `in_review`, `approved`, `reopened`).
- **`case_codes`** — one row per assigned code, pointing at exactly one of two
  catalog tables (`icd_10_id` XOR `icd_9_id`, enforced by a check constraint
  since the 2026-07-28 catalog split — V3 migration); carries `code_role`
  (principal/secondary/other/external-cause/procedure) and `source`
  (`imported_from_imed` vs. `coder_assigned`). ICD-9 rows additionally carry
  an operation time window and operation type (V4, V5 migrations), because a
  procedure code represents something that happened over a time span, which
  the hospital's own write API requires.
- **`case_code_edits`** — the coder's working list, one JSON document per
  case, stored and echoed verbatim. This is where the UI keeps each row's
  `selected` tick and its `origin` (`manual`/`hospital`/`ai`), so the
  frontend can add such fields without a schema change; approve reads it and
  turns the ticked rows into `case_codes`.
- **`icd_10`** / **`icd_9`** — the reference catalogs, split into two tables
  (V3) specifically because the two coding systems were expected to diverge
  in what columns they need, rather than sharing one table that grows nulls.
- **`case_report_sections`**, **`case_orders`**, **`case_vitals`** — the
  chart itself: doctor's notes by document type × field name, lab/drug/
  imaging/surgery orders, and vital-sign readings, all foreign-keyed to
  `cases` (a 2026-08-20 migration, V6, closed a gap where two of these
  tables had been created without that FK by hand-written code that bypassed
  the migration system — see `medcode-api/CLAUDE.md`, "Flyway" milestone,
  for the full incident).
- **`coding_history`** — the audit trail: one row per coder action
  (approved/reopened/code_assigned), oldest first, surfaced to the coder as
  case history and to Chapter 5/8's audit-trail claims.
- **`imed_write_ops`** (V2) — the write-back journal: a before-image of every
  hospital row this system has ever created, edited, or cancelled, which is
  what makes `reopen` able to *reverse* a write-back rather than merely
  forget it happened (§4.1 has the mechanics).
- **`users`**, **`auth_sessions`** (V1) — coder/admin accounts (BCrypt
  password hashes) and server-side Bearer-token sessions.
- **`case_stars`** (V8), **`app_settings`** (V9) — a shared "look at this
  case first" flag any coder can set, and admin-configurable display-policy
  switches (which identifier fields the case list may show).

### 3.3.2 `imed` — the mock hospital system

Mirrors the hospital's actual extract tables (`medhack_patient`,
`medhack_diagnosis_icd10`, `medhack_procedure_icd9`, lab/drug/vital order
tables, …) plus the write-side objects the real "iMed Diagnosis and Medical
Discharge API" defines (`imed-mock-api/src/main/resources/db/migrations/
V1__api_v1.sql` and following). It is intentionally built **field-for-field**
against the hospital's real API contract PDF
(`medcode-api/docs/MedCode-AI-iMed-Integration-API-Contract-v1.pdf`), so
swapping this mock for the real hospital system in production is meant to be
a configuration change (`IMED_API_BASE` + a token), not a rewrite —
Chapter 8 revisits how confident that claim currently is.

### 3.3.3 Coverage / financial context

`coverage_types` maps the hospital's raw coverage codes (e.g. `UCS_89_I`)
to Thailand's national scheme families — UCS (~72% of the population, NHSO),
CSMBS/`OFC` (civil servants, ~9%), and SSS (private-sector social security,
~19%) — though the current dataset happens to contain **no SSS rows at all**,
a gap the team has flagged as worth asking the hospital about
(`docs/medical-glossary.md`, §8). This table is what would let a future
version of the analytics page report coding backlog *by payer*, which
matters given the DRG/reimbursement framing in Chapter 1.

## 3.4 Screen design

The coder UI is one screen per task, in Thai or English (the admin console is
English only). Its design rules follow from Chapter 1: the coder's decision
must be explicit, the source of every code must be visible, and nothing the
AI proposes may look like a fact.

| Screen | What it shows | Design rule |
|---|---|---|
| Case list (dashboard) | Four tabs: Complete, Incomplete (with a "missing N" badge), Reopened, Finished; search, filters, a shared star | One case sits in exactly one tab; a star is visible to everyone and removable only by whoever set it |
| Sync dialog | Quick ranges (Today … Everything), a specific date, or a date range, then a confirmation | Sync never touches an approved case, so it is safe to repeat |
| Case detail | The hospital chart (hospital-panel or chronological view), vital signs, and one column each for ICD-10 and ICD-9 | The chart is read-only; codes are grouped by origin (coder, hospital record, AI) and only AI rows carry a confidence percentage |
| Code selection | A checkbox per code, "Select all", a picked/total counter, drag to reorder | **Nothing is pre-ticked.** The top ticked ICD-10 is the principal diagnosis; Approve stays disabled until both columns have a pick (or "no procedure" is ticked) |
| Approve and reopen dialogs | How many codes will be written, and that unticked codes stay behind | Both actions are confirmed and logged; reopen says plainly that codes written to iMed are withdrawn |
| AI Agent | Code dictionary chat and Suggest & Learn, with chat history | Answers cite their sources; codes not found in any retrieved passage are flagged |
| Admin console | Dashboard with display switches, accounts, AI Training | Accounts with coding history cannot be deleted, only deactivated |

<p align="center"><img src="../../audit-chart-frontend/docs/screenshots/06-placeholder.png" alt="Case list after a sync"><br><em>Figure 3.5 · The case list after a sync (Complete tab, Thai UI)</em></p>

<p align="center"><img src="../../audit-chart-frontend/docs/screenshots/09-placeholder.png" alt="Case detail with AI suggestions"><br><em>Figure 3.6 · Case detail: the chart on the left, AI-suggested ICD-10 and ICD-9 codes with confidence on the right, none pre-ticked</em></p>

Every screen, coder and admin, is reproduced in Appendix E and explained step
by step in the Thai user guide (`audit-chart-frontend/docs/USER-GUIDE-TH.pdf`).
