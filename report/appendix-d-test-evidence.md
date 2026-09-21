# Appendix D — Test cases / automated test evidence

*This appendix is the raw correctness-test evidence — cross-reference with
Ch.6, which draws the line between correctness tests (this appendix) and
the accuracy/performance evaluation (Ch.6's own tables), and with
`medcode-stack/eval-results/SUMMARY.md`, the team's single source of truth
for every number in Ch.6/Ch.7.*

## Automated test suites

| Suite | Result | Raw output |
|---|---|---|
| `imed-mock-api` — `ImedMockApiIntegrationTest` | **19/19 passed** — covers the mock hospital's REST contract (visit reads, ICD catalog reads, diagnosis/discharge write-back, request-id dedup) | `eval-results/imed-mock-api-test-output.txt` |
| `medcode-api` — full suite | **90/91 passed, 1 flagged** (see below) | `eval-results/medcode-api-test-output-rerun-with-imed-live.txt` (1,748 lines) |
| `RAG` — `pytest tests/` | **82/82 passed** | `eval-results/rag-test-output.txt` |

**The one medcode-api failure**
(`CasesApiIntegrationTest.approveThenReopenRoundTripsAndInvalidatesCache`) is
a **test-isolation gap against an out-of-process dependency**, not a
confirmed application defect: it calls the live `imed-mock-api` process,
whose writes land in the real local Postgres and aren't rolled back by the
Spring test transaction. Running the suite twice against a long-lived mock
hospital accumulates rows the test didn't expect. Flagged honestly in
Ch.6/Ch.8 as something a real CI pipeline needs to fix (reset the mock
hospital DB between runs, or assert on a delta instead of an absolute
count) — full root-cause writeup in `eval-results/SUMMARY.md`.

## RAG test suite breakdown (`RAG/tests/`)

| File | What it covers |
|---|---|
| `test_suggest_boxes.py` | Each ICD-10/ICD-9 column only surfaces codes from its own upload box |
| `test_suggest_notes.py` | Case suggestions respect the coder's taught rules |
| `test_learn.py` | Suggest & Learn: rule extraction, classification, storage, matching (no embeddings/LLM — stubbed) |
| `test_chunking.py` | The document chunker, unit-level, no heavy model deps |
| `test_api.py` | API smoke tests via FastAPI's TestClient (excludes `/chat` and embedding paths — too heavy for a smoke test) |
| `test_graphstore.py` | The knowledge graph, pure networkx, no models involved |

## Development history

`medcode-api/CLAUDE.md`'s "Progress" section is a dated engineering
changelog kept throughout the build — offered as evidence of iterative,
tested delivery (matching commits to test runs) rather than a single
big-bang build, if that matters for the TRL-4 case in Ch.6.

## Where this differs from Ch.6's own evidence

This appendix is **correctness only** — does the code do what it's
supposed to, structurally. It is not the same evidence as:

- **Performance/load testing** (Apache Bench results, `eval-results/perf/`) —
  Ch.6.
- **AI output accuracy** (ICD-10 top-1/top-8 against `/suggest`) —
  Ch.6/Ch.7, `eval-results/rag-accuracy-SUMMARY.md` +
  `rag-accuracy-raw.json`.
- **Staff feedback** — Appendix E (questionnaire; not yet administered).

Conflating "tests pass" with "the AI is accurate" or "coders like it" is
exactly the mistake Ch.6 is written to avoid — see its own framing.
