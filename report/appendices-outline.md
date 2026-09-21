# Appendices — outline

*Bullet outline only. Each item points at source material that already
exists in the repos — nothing here needs to be authored from scratch except
where marked `[TODO]`.*

## Appendix A — API reference

- Link/embed `medcode-api/docs/api-contract.md` in full (the authoritative,
  hand-maintained contract — "source of truth," per its own header) rather
  than re-deriving endpoint tables in the appendix.
- Link the TypeScript mirror `medcode-api/docs/types.ts` for readers who want
  exact response shapes.
- Attach the hospital-facing PDF:
  `medcode-api/docs/MedCode-AI-iMed-Integration-API-Contract-v1.pdf` — this
  is the contract MedCode AI wrote and sent *to* the hospital for the R1–R6
  read side.
- Link `medcode-api/docs/imed-integration.md` (design + the 17 open
  questions for the hospital) and `medcode-api/docs/imed-writeback-as-built.md`
  (real request/response bodies, byte-for-byte, with the "as built vs. spec"
  discrepancies called out).

## Appendix B — Architecture & data-flow diagram

- Embed `medcode-api/docs/dataflow.html` directly (it is already an
  interactive, maintained diagram covering the system boundary, the case
  pipeline, sync/approve/reopen, auth, and the RAG seam — see Chapter 3,
  §3.2) — as a screenshot set or an embedded frame, not redrawn.
- `medcode-stack/README.md`'s "What runs where" port table, reproduced
  verbatim if a compact reference table is wanted alongside the diagram.

## Appendix C — Database schema

- List all Flyway migrations as the schema's own change log, most readable
  in order:
  - `medcode-api/src/main/resources/db/migrations/V1__add_password_hash.sql`
    through `V9__app_settings.sql`
  - `imed-mock-api/src/main/resources/db/migrations/V1__api_v1.sql` through
    `V6__icd_catalog_data.sql`
- `medcode-api/docs/medical-glossary.md` as the plain-language companion —
  every table/column's real-world meaning, sourced and honest about which
  fields are project inventions vs. hospital data (§11 of that file is a
  direct index of "terms that are OUR rules, not medicine").

## Appendix D — Test cases / automated test evidence

- `eval-results/medcode-api-test-output.txt` (1,748 lines — the
  `CasesApiIntegrationTest` / `AdminApiIntegrationTest` / etc. run) and
  `eval-results/imed-mock-api-test-output.txt`. These are **correctness**
  tests (46/46 green per `medcode-api/CLAUDE.md`'s own progress log), not an
  accuracy/usability evaluation — see the Ch.6/Ch.7 stubs for that
  distinction.
- `medcode-api/CLAUDE.md`'s "Progress" section doubles as a dated engineering
  changelog and could be excerpted for an appendix on development history,
  if the assessors want evidence of iterative, tested delivery rather than a
  single big-bang build.
- `RAG/tests/` (chunking unit tests + API smoke tests) as the RAG service's
  own test coverage.

## Appendix E — Questionnaires

- **`[TODO]`** — none exist yet. This project has not run a coder
  usability survey, a clinician validation questionnaire, or a hospital
  stakeholder interview protocol. If Chapter 6/7 end up including a real
  evaluation before submission, the questionnaire instrument used should be
  appended here, along with raw (anonymized) responses if permitted.

## Appendix F — Screenshots

- All 21 screens captured 2026-09-21 from a running docker-compose stack
  against seeded demo data, Thai UI, coder role:
  `audit-chart-frontend/docs/screenshots/01-placeholder.png` through
  `21-placeholder.png`. Shared with the Thai user guide
  (`audit-chart-frontend/docs/USER-GUIDE-TH.md`), which embeds them inline —
  reuse those files here rather than recapturing.
- **`[TODO — remaining]`** the Admin — AI Training page (`03-design.md`
  §3.4, item 7) still needs capturing; it requires the SuperAdmin login
  (`admin@medcodeai.demo`), not the coder account used for the rest.

## Appendix G — Production-readiness checklist (supporting material for Ch.8)

- `medcode-api/docs/DEPLOYMENT-PREP.md` in full — the 28-item checklist
  Chapter 8's gap list summarizes; worth including verbatim as an appendix
  since it is already written for a non-engineering audience and tags each
  item by owner (`[say]` / `[ask]` / `[IT]`).
- `medcode-api/docs/PITCH-2MIN.md` — the condensed spoken version, useful if
  the assessment includes an oral defense/pitch component.

## Appendix H — Data provenance detail (supporting material for Ch.5)

- `imed-mock-api/scripts/generate_demo_data.py` in full, or at minimum its
  docstring and the domain-source citations inside it — the primary
  evidence for every claim in Chapter 5, §5.1.
- `imed-mock-api/DEMO-SETUP.md` — the runbook showing exactly how the
  synthetic dataset is loaded, snapshotted, and reset, for a reader who
  wants to reproduce the demo end to end.
