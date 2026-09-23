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

## 6.4 What was not tested

- Manual vs. AI-assisted coding time comparison, and comparison against the
  hospital's own historically-coded visits — **out of scope for this
  submission.** No partner-hospital timing or coding-volume data was
  available in time, and the team judged extrapolating from a 1–5-case
  internal timing sample (source: `Cura AI.pdf`) as more likely to mislead
  than inform under this deadline, so it was cut rather than presented as
  evidence. See Ch.2's Klang et al. citation for the methodology a real
  comparison would need.
- Concurrent multi-coder write contention (simultaneous approve/edit).
- RAG suggestion latency under load.
- Structured staff/coder feedback — **out of scope for this submission.**
  No real coder was available to pilot a feedback instrument before the
  deadline.
- UI usability walkthrough with a non-team user (screenshots exist —
  Appendix F — but no outside user has been observed using the system).
- **`/chat` (the full LLM-reasoning path a coder sees in the AI Agent) was
  not separately scored** — only `/suggest` (retrieval-only) was evaluated
  (§6.3). Out of scope for this submission: the generation model
  (`Llama-3.1-EIRAI-8B` via Ollama) could not be pulled during this
  evaluation pass (Ollama's client rejected a cross-host redirect from
  Hugging Face's CDN on every retry), and `/chat` shares the same retrieval
  layer already tested in §6.3, so the team judged fixing that download path
  under deadline pressure not worth the time versus the marginal new
  information it would likely produce.

## 6.5 Test case summary

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
