# Chapter 6 — Testing & Evaluation

Every number in this chapter traces to a file in `eval-results/` (raw output,
reproduce commands included) or to the team's own pitch deck (`Cura AI.pdf`,
prepared by Suvarna), cited explicitly where used. Nothing here is estimated
or invented for this report.

## 6.1 Automated test suites

| Suite | Result | Raw output |
|---|---|---|
| `medcode-api` JUnit (`./mvnw test`) | **90/91 passed**, 1 failure (see below) | `medcode-api-test-output-rerun-with-imed-live.txt` |
| `imed-mock-api` JUnit (`./mvnw test`) | **19/19 passed** | `imed-mock-api-test-output.txt` |
| RAG `pytest tests/` | **82/82 passed** | `rag-test-output.txt` |
| `audit-chart-frontend` | No test files in the repo | — |

**Total: 191/192 automated tests passing (99.5%).**

The suite was run twice for `medcode-api`, deliberately: once with
`imed-mock-api` not started (12 tests errored with "iMed API not reachable"
— an unstarted-dependency artifact, not a defect) and once with it running
live (11 of those 12 then passed). The one remaining failure,
`CasesApiIntegrationTest.approveThenReopenRoundTripsAndInvalidatesCache`,
is a test-isolation gap: it calls the live `imed-mock-api` process, whose
writes land in the real local Postgres `imed` database and are not rolled
back by the Spring test transaction, so running the suite twice against a
long-lived mock-hospital instance accumulates rows the test didn't expect.
Full root-cause detail in `eval-results/SUMMARY.md`.

## 6.2 Performance / load testing

Apache Bench (`ab`) against a locally-running `medcode-api` (localhost,
single instance, no network latency — a code-level capacity baseline, not a
production-network estimate):

| Endpoint | Load | Throughput | p50 / p95 / p99 | Failures |
|---|---|---|---|---|
| `GET /api/health` | 500 req, c=10 | 13,266 req/s | 1 / 1 / 2 ms | 0/500 |
| `GET /api/cases` (authenticated) | 300 req, c=10 | 3,426 req/s | 2 / 5 / 7 ms | 0/300 |
| `GET /api/cases` (stress) | 2,000 req, c=50 | 6,569 req/s | 7 / 19 / 28 ms | 0/2,000 |

Zero failed requests at every load level tested, including 50 concurrent
clients. Latency grows roughly linearly with concurrency, no cliff observed
in this range. **Not measured:** RAG suggestion latency (the slowest step in
the real coder flow) and concurrent-write contention (multiple coders
approving/editing simultaneously) — both flagged as gaps in 6.6. Raw output
and reproduce steps: `eval-results/perf/`.

## 6.3 AI-suggestion accuracy (retrieval evaluation)

Ground truth: 42 clinical scenarios from `imed-mock-api/scripts/generate_demo_data.py`,
each hardcoding a clinically-intended ICD-10 (and sometimes ICD-9) code
alongside the Thai chart-note text used to build that demo visit. Each
scenario's note text was sent to RAG's `POST /suggest` (retrieval-only; does
not invoke the LLM) and the correct code's presence/rank in the response was
recorded.

| Metric | Result |
|---|---|
| ICD-10 top-1 accuracy | 0/42 (0.0%) |
| ICD-10 top-8 (anywhere in the suggested list) | 3/42 (7.1%) |
| ICD-9 top-1 (of 23 applicable scenarios) | 0/23 (0.0%) |
| ICD-9 top-8 | 1/23 (4.3%) |

**This number needs the root-cause explanation to be useful, not just cited.**
A manual follow-up confirmed retrieval is *not* broken in general — querying
`POST /retrieve` with `"J00 common cold"` returns the exact correct reference
chunk with `score: 1.0` (`via: "exact match: J00"`). But the same visit's
*actual symptom narrative* ("mild fever, clear rhinorrhea, sneezing, sore
throat, dry cough for 3 days," no code or diagnosis name mentioned) returns
unrelated codes pulled from an apparently mis-chunked, index-style region of
one reference PDF. **The gap is specifically symptom-narrative → diagnosis-code
retrieval — the actual coder use case — not code-lookup retrieval in
general.** This is the single most actionable engineering finding in this
evaluation. Full writeup: `eval-results/rag-accuracy-SUMMARY.md`; raw
per-case data: `eval-results/rag-accuracy-raw.json`.

Caveats: this is a synthetic, template-derived gold set (written by the same
team that built the retrieval corpus, so some vocabulary overlap is
possible in either direction); it tests `/suggest` (retrieval-only), not the
full `/chat` LLM-reasoning path a coder sees in the app today; it is not a
substitute for scoring against real historical hospital coding.

## 6.4 Manual vs. AI-assisted coding time

The team timed itself completing a small number of cases (1–5) both without
and with AI assistance, using this system's own demo (source: `Cura AI.pdf`
pitch deck, "Is It Actually Worth It?"):

| | Manual | AI-assisted (Cura AI) |
|---|---|---|
| Time per case | ~8 minutes | ~1.36 minutes |
| Ratio | — | **~5.9× faster** |

**Read this as a small-sample, single-tester directional result, not a
validated throughput study.** The deck also states "260 → 1,500 cases/day"
and "+1,240 cases/day at ฿340/case = ฿421,600/day" — these are **not**
separately measured; they are the same ~5.9× ratio applied to an assumed
daily case volume and per-coder workload (260 × 5.9 ≈ 1,529 ≈ the deck's
1,500), i.e. an extrapolation from the timing ratio, not an independent
hospital-capacity measurement. Presented in Ch.7 with that caveat attached;
a real pilot would need to time considerably more cases, more testers, and
ideally an actual hospital coder rather than a team member.

### 6.4.1 External benchmark context (not hospital-specific)

Neither figure above is hospital-specific — no partner-hospital timing or
coding-volume data exists to compare against (§6.5). Published literature
offers a rough sanity check on the two numbers separately, with the
mismatches stated plainly rather than glossed over:

- **The manual-coding baseline (~8 min/OPD case).** AHIMA's ICD-10-CM/PCS
  coding productivity studies found US **inpatient** coding averaged
  **37–44 minutes per record** shortly after ICD-10 go-live, settling around
  37 minutes by mid-2016, against a ~20-minute ICD-9 baseline
  ([AHIMA ICD-10 Coding Productivity Study](https://journal.ahima.org/Portals/0/archives/AHIMA%20files/ICD-10%20Coding%20Productivity%20Study%20Highlights%20Emerging%20Standards.pdf)).
  Not a like-for-like comparison — that figure is **inpatient** (DRG-relevant,
  longer charts, US ICD-10-CM/PCS), while this project's scope is **OPD**
  (Ch.1 §1.5) under Thailand's ICD-10-TM. The team's 8-minute **outpatient**
  figure sitting well under the US **inpatient** figure is directionally
  sensible (OPD charts are shorter, fewer codes), not evidence the number
  is accurate — it just isn't implausible on its face.
- **The AI speed-up (~5.9×).** Published studies of AI assistance in
  adjacent clinical workflows — AI scribes reducing physician documentation
  time — report far more modest gains: roughly **9–10% time reduction**,
  on the order of 12–20 minutes saved per **day** (not per case), across
  large multi-site studies
  ([STAT: large AI scribe study finds modest, inconsistent time savings](https://www.statnews.com/2026/04/01/ai-ambient-scribes-modest-time-savings-clinical-documentation/),
  [Medical Economics: AI scribes cut documentation time](https://www.medicaleconomics.com/view/ai-scribes-cut-documentation-time-by-69-in-simulated-primary-care-visits-study-finds)).
  Those studies measure a different task (physicians dictating/reviewing
  notes) with a different AI role (transcription/drafting, not code
  suggestion), so they aren't a direct substitute either. But the gap
  between "~9–10% in large published studies" and "~490% in this project's
  1–5-case, single-tester demo" is wide enough that it should be read as
  **a reason for caution, not confirmation** — the same caveat already
  attached to the 5.9× figure above, now with an external reference point
  for why that caution is warranted.

This subsection is **context, not validation** — it does not replace the
missing hospital-specific comparison (§6.5), and no hospital-specific
number is claimed or implied by citing it.

## 6.5 What was not tested

- Concurrent multi-coder write contention (simultaneous approve/edit).
- RAG suggestion latency under load.
- Comparison against the hospital's own historically-coded visits (the
  methodology Ch.2's Klang et al. citation uses) — no access to real hospital
  coding data.
- Structured staff/coder feedback (survey or interview) — not collected for
  this submission.
- Screenshots / UI usability walkthrough with a non-team user.

## 6.6 Test case summary

| # | Test case | Result |
|---|---|---|
| 1 | `medcode-api` correctness (91 cases: auth, cases CRUD, sync, approve/reopen, admin, docs) | 90 pass / 1 known isolation issue |
| 2 | `imed-mock-api` correctness (19 cases: visit reads, catalog reads, write-back, dedup) | 19/19 pass |
| 3 | RAG service correctness (82 cases: chunking, suggest boxes, learn/teach rules, API routing) | 82/82 pass |
| 4 | `medcode-api` load: health endpoint, 500 req @ c=10 | 0 failures |
| 5 | `medcode-api` load: cases endpoint, 300 req @ c=10 | 0 failures |
| 6 | `medcode-api` stress: cases endpoint, 2,000 req @ c=50 | 0 failures |
| 7 | AI accuracy: 42 scenarios, ICD-10 top-1 | 0/42 — root cause identified (6.3) |
| 8 | AI accuracy: 42 scenarios, ICD-10 top-8 | 3/42 |
| 9 | Manual vs. AI-assisted timing, small sample | ~5.9× faster (6.4) |
