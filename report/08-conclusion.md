# Chapter 8 — Conclusion

This chapter is structured as two lists, what can be claimed now and what
genuinely remains, followed by what we learned and what running the system
would cost.

## 8.1 What is built, and what the demo actually proves

The following can be stated as fact, because it is demonstrated by working
code and the automated test suites (191 of 192 tests passing, Chapter 6
§6.1; raw output in `eval-results/`), not by aspiration:

- **A complete, working, human-in-the-loop coding pipeline exists**, from
  pulling a visit out of a hospital system, through AI-assisted suggestion,
  coder review and edit, to an auditable, reversible write-back into the
  hospital's own database — all five services running together via a single
  `docker compose up` command (`medcode-stack/README.md`).
- **The write-back is not a mock-only trick.** It was built field-for-field
  against the hospital's own real API contract PDF and its request/response
  bodies are documented exactly as the code emits them
  (`medcode-api/docs/imed-writeback-as-built.md`) — the gap to production is
  a base-URL and token swap plus the open hospital questions in §8.3, not a
  rewrite.
- **The AI-assistance safety model is enforced in code, not just policy**:
  suggestions write nothing, nothing is pre-selected, generation is grounded
  against retrieved reference text with an explicit `unverified_codes` check,
  and the whole AI layer can be switched off without breaking the rest of the
  workflow (Chapter 4, §4.3).
- **The demo dataset is honest about what it is**: deterministic, synthetic,
  documented, and reversible (Chapter 5) — nothing about the demo pretends to
  be real patient data or a real accuracy measurement.
- **The path to production is written down.** `medcode-api/docs/DEPLOYMENT-PREP.md`
  is a 28-item checklist that separates what the team controls from what
  only the hospital can decide, including the two largest gaps this report
  also names: no PDPA compliance work and no accuracy comparison against
  real coded data.

**What the demo does *not* prove**, stated with equal directness: it does
not prove the AI suggestions are clinically accurate on real charts (the
only accuracy measurement is on synthetic data, and it is weak — Chapter 6
§6.3; no comparison against real hospital-coded data exists), it does not
prove the system performs acceptably at real hospital volumes (the load test
ran on one machine against the read path, and concurrent writes by several
coders were not tested — Chapter 6 §6.2), and it does not prove the write-back contract matches the hospital's
*actual* production behavior, because — as the team's own docs state
outright — **"MedCode AI has never called a real iMed server"**
(`medcode-api/docs/imed-writeback-as-built.md`, opening status note). Every
response shape this system codes against is what the mock, built from the
hospital's PDF, returns — not a production observation.

## 8.2 What is needed for real deployment: the gap list

This list intentionally mirrors the structure the team already built in
`medcode-api/docs/DEPLOYMENT-PREP.md` (28 items, tagged by who owns each
one) rather than inventing a new taxonomy — reproducing their own honest
accounting is more credible than restating it in different words. Grouped
by theme:

**1. Hospital data & the biggest open technical question.** Production needs
the hospital's real ID lists (visit type, diagnosis type, operation type,
discharge status — this system currently uses safe placeholders), a real
feed for the 11 kinds of data this system reads (nothing currently sends
that data automatically — sync happens against the mock), and — the single
largest open unknown in the entire integration — **how a coding approval,
which happens *after* a patient is discharged, interacts with the hospital's
requirement that every write include discharge information**
(`medcode-api/docs/imed-integration.md`, open question 3). This is not a
minor implementation detail; until it is answered, the write-back's
discharge-object fields remain deliberately non-clinical placeholders.

**2. Identity and access.** Coders currently log in with an email/password
this system manages itself. Production needs integration with the
hospital's own identity system (SAML or OIDC — Entra ID, AD FS, Google
Workspace, or Keycloak, depending on what the hospital already runs), so
access is revoked the same hour an employee leaves, rather than depending on
someone remembering to tell this system (`DEPLOYMENT-PREP.md`, §1).

**3. Infrastructure.** Two ordinary servers and one GPU (24 GB is sized for
headroom, not a hard minimum — a 16 GB card also works, and the system runs,
more slowly, with no GPU at all, because the AI is optional by design).
PostgreSQL 18.6 or newer specifically (versions 15–17 fail partway through
loading this system's data). A decision on whether the GPU stays physically
inside the hospital, driven directly by the PDPA cross-border-transfer
question in Chapter 5 (`DEPLOYMENT-PREP.md`, §3).

**4. A real PDPA compliance review.** Restated from Chapter 5, §5.5, because
it belongs on this list too, not only in the data chapter: a Data Protection
Impact Assessment, a determined lawful basis, a data processing agreement,
a real (per-record) retention/erasure policy replacing the current demo
reset, and the hospital's DPO sign-off. **None of these exist yet.**

**5. Accuracy validation against real coded data.** The single measurement
this report has deliberately not attempted anywhere (Chapters 6, 7): running
this system's AI suggestions over a set of visits the hospital's own coders
have already coded, and comparing — the same methodology the Klang et al.
emergency-department study used (Chapter 2, §2.2), which is exactly the
comparison the team's own checklist names as *"the one item that decides if
the product is actually useful"* (`DEPLOYMENT-PREP.md`, §2). This requires
the hospital to share historical, de-identified coded visits — it cannot be
manufactured from synthetic data.

**6. A real clinician/coder validation study, and a small pilot.** Beyond a
retrospective accuracy comparison (#5), the team's own five-step rollout
plan calls for a staged validation: a staging environment where a real coder
signs in and opens a case, then a single real write-back the hospital can
verify inside its own iMed system, then the hospital's head coder and
security team both signing off, then a one-team, one-week pilot running
alongside the existing manual process before any wider rollout
(`DEPLOYMENT-PREP.md`, "The 5 steps to the first real patient"). None of
these five steps have started.

**7. Load and concurrency testing at real scale.** This system's backend is
architecturally constrained to a **single instance** — its write lock and
cases cache live in process memory, not the database (Chapter 3, §3.2) —
which is a workable, even principled, design for a hospital-scale
deployment, but it has never been load-tested against real hospital visit
volumes or a realistic number of concurrent coders. Whether one instance is
actually sufficient at the partner hospital's real case volume is unverified.

**8. Master-data and field-mapping confirmations from the hospital.**
`medcode-api/docs/imed-integration.md` lists seventeen open questions for
the hospital beyond the discharge-coupling question in #1 — including
whether the extract's transaction number is guaranteed to be the same
identifier the write API expects, how cancelled/duplicate rows behave, and
several UI-parity fields (doctor name, clinic, chronic-disease flag) the
hospital's own coder screen shows that this system currently cannot display
because no data source for them has been confirmed. **These are correctly
treated by the team as questions to ask, not gaps to guess around** — the
team explicitly declined to invent placeholder clinical data for any of
them, which is the right call for a system that writes into a real medical
record, but it does mean this list of unknowns is a real, unresolved
dependency on the hospital's own IT team, not a to-do the engineering team
can close alone.

## 8.3 What we learned

- **Measuring found what reviewing missed.** The code review never caught
  that symptom narratives retrieve the wrong manual pages. The 42-case
  accuracy run did, in one afternoon, and turned a vague worry into a
  specific target: chunking and retrieval on narrative text (Chapter 6 §6.3).
- **Two copies of the truth drift.** Schema changes once lived both in Java
  and in SQL files nothing ran; the copies diverged and two tables lost their
  foreign keys. Moving to Flyway as the single definition fixed it. The same
  lesson shaped the API: a test now fails the build whenever the documented
  endpoint list and the code disagree, in either direction.
- **Tests that touch shared data need their own fixtures.** Early write tests
  approved and reopened visits other tests read, and silently cancelled real
  seed procedures in the mock hospital. Splitting fixtures into
  "sacrificial" and "read-only" visits made the suite repeatable.
- **Keeping the AI optional kept the project on schedule.** Because coding,
  approval and write-back never depend on the AI service, the blocked chat
  model (Chapter 6 §6.4) cost one feature, not the product.

## 8.4 Operating cost

`HARDWARE_SPEC.md` prices a pilot from public listings (September 2026,
converted at ~33 THB/USD, before VAT and reseller markup; not vendor quotes):

| Scenario | Rough one-time cost (THB) |
|---|---|
| Minimum: reuse spare hospital servers, one 16 GB GPU, a small NAS | ~120,000–140,000 |
| Recommended: new app and database servers, one 24 GB GPU, a redundant NAS | ~360,000–440,000 |

The software itself has no per-code, per-user or cloud fee: the models are
open and run on the hospital's own card, so the running cost does not grow
with coding volume (`DEPLOYMENT-PREP.md`, "What it costs"). Power, backup
storage and staff time for updates are the recurring costs; they are not
priced here. Several inputs (coder headcount, visit volume, hosting choice)
are open questions only the hospital can answer, listed in
`HARDWARE_SPEC.md` §7.

## 8.5 Conclusion

The engineering is substantially done and tested against a faithful mock of
the real integration: a coder can sync visits from the hospital, get
suggestions grounded in the coding manuals, decide, approve, and see the
codes land in the hospital's own records, with every write journaled and
reversible. The AI's suggestion quality on symptom narratives is not yet good
enough to rely on, and that is the first thing to fix. Everything else on the
path to a real hospital is mostly non-engineering work: legal and compliance
review, hospital IT coordination, hardware, and a validation study on real
coded data. That matches the team's own framing: *"To run it in a real
hospital, three more things are needed. None of them are code"*
(`medcode-api/docs/DEPLOYMENT-PREP.md`, TLDR).
