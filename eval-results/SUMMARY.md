# Automated Test Evidence — MedCode AI (2026-09-18)

Raw evidence for Ch.6 (Testing & evaluation). Every number below traces to a
file in this directory or to `target/surefire-reports/` in the respective repo
(regenerate by re-running the commands shown; not committed here as they are
build artifacts).

## imed-mock-api — `./mvnw test`

- **Result: 19/19 passed, 0 failures, 0 errors.**
- Raw output: `imed-mock-api-test-output.txt`
- Suite: `ImedMockApiIntegrationTest` (19 cases) — covers the mock hospital's
  REST contract (visit reads, ICD catalog reads, diagnosis/discharge
  write-back, request-id dedup).

## medcode-api — `./mvnw test`

Run twice, deliberately, to separate environment errors from real failures.

**Run 1 — `imed-mock-api` NOT running** (`medcode-api-test-output.txt`):
- 91 tests: 79 passed, 0 failures, **12 errors**.
- All 12 errors are `IllegalStateException: iMed API not reachable at
  http://localhost:8003` — i.e. tests that call out to the mock hospital
  service over HTTP, and that service wasn't started. Not product bugs.

**Run 2 — `imed-mock-api` started live on :8003, then re-run**
(`medcode-api-test-output-rerun-with-imed-live.txt`):
- 91 tests: **90 passed, 1 failure, 0 errors.**
- The 11 previously-erroring tests in `CasesApiIntegrationTest` and
  `AdminApiIntegrationTest` now pass — confirms those 12 "errors" in Run 1
  were purely an unstarted-dependency artifact, not defects.
- **1 real failure:** `CasesApiIntegrationTest.approveThenReopenRoundTripsAndInvalidatesCache`
  — `AssertionError: JSON path "$.stats.mcai_code_rows" expected:<2> but was:<3>`.
  Root cause (not yet fixed): this test calls the live imed-mock-api process,
  whose writes land in the real local Postgres `imed` database and are **not**
  rolled back by the Spring test transaction (unlike calls that stay inside
  medcode-api's own transactional boundary). Running the suite against a
  long-lived mock-hospital instance more than once accumulates rows the test
  didn't expect. This is a **test-isolation gap against an out-of-process
  dependency**, not a confirmed application defect — flag honestly in Ch.6 and
  the limitations section (Ch.8) as something a real CI pipeline would need to
  fix (e.g. reset the mock hospital DB between runs, or make the test assert
  on a delta rather than an absolute count).

## Performance / load testing — `medcode-api`, Apache Bench (`ab`)

Machine: local dev laptop (macOS, Apple Silicon), medcode-api + imed-mock-api
+ Postgres all running locally — **no network latency**, single instance, no
containerization overhead. Treat these as a capacity/regression baseline for
the app code itself, not a production-network estimate (flag this caveat in
Ch.6/Ch.8 — see `perf/` for raw `ab` output).

| Endpoint | Load | Result | p50 / p95 / p99 | Failures |
|---|---|---|---|---|
| `GET /api/health` (unauthenticated) | 500 req, concurrency 10 | 13,266 req/s mean | 1ms / 1ms / 2ms | 0/500 |
| `GET /api/cases` (authenticated, real dashboard query) | 300 req, concurrency 10 | 3,426 req/s mean | 2ms / 5ms / 7ms | 0/300 |
| `GET /api/cases` — **stress** | 2,000 req, concurrency 50 | 6,569 req/s mean | 7ms / 19ms / 28ms | 0/2000 |

- Raw output: `perf/medcode-api-health.txt`, `perf/medcode-api-cases.txt`,
  `perf/medcode-api-cases-stress.txt`.
- **Zero failed requests** across all three runs, including the 50-concurrency
  stress run — no errors, no degraded responses, latency grows roughly
  linearly with concurrency (p50 2ms→7ms from c=10 to c=50), no sign of a
  cliff at these levels.
- Reproduce:
  ```
  TOKEN=$(curl -s -X POST http://localhost:8001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@medcodeai.demo","password":"admin1234"}' \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
  ab -n 2000 -c 50 -H "Authorization: Bearer $TOKEN" http://localhost:8001/api/cases
  ```
- **Not measured:** RAG suggestion latency (the AI call is the slowest part of
  the real user flow — a coder opening a case and waiting for suggestions —
  and isn't covered by this backend-only load test), and any test with
  concurrent *write* traffic (approve/edit), which is the more realistic
  multi-coder contention scenario. Both are gaps to flag honestly in Ch.6/Ch.8
  if not completed before submission.

## Reproduce

```
# terminal 1
cd imed-mock-api && ./mvnw spring-boot:run   # port 8003

# terminal 2
cd medcode-api && ./mvnw spring-boot:run     # port 8001, for perf tests
# or: ./mvnw test                            # for the JUnit suite
```

## RAG service — `pytest tests/`

- **Result: 82/82 passed, 0 failures.**
- Raw output: `rag-test-output.txt`.
- Environment note: system Python was 3.9 (too old for this repo's pinned
  deps, which need ≥3.10); used Homebrew Python 3.12 in a local `.venv-eval`
  (gitignored, not committed) instead.

## AI output accuracy — `rag_accuracy_eval.py` against `POST /suggest`

- **Result: ICD-10 top-1 0/42 (0.0%), top-8 3/42 (7.1%).** Full writeup,
  root-cause analysis, and caveats: `rag-accuracy-SUMMARY.md`. Raw per-case
  data: `rag-accuracy-raw.json`.
- **This is a real, substantive finding, not a broken test:** manually
  confirmed retrieval is excellent on exact-term queries (score 1.0 for
  `"J00 common cold"`) but does not bridge natural symptom narratives to the
  right diagnosis code — a genuine gap in the current chunking/retrieval
  setup for the actual coder use case (a chart with symptoms, not a
  pre-known code). Flag this specifically in Ch.7/Ch.8, it is more useful to
  the team than a single accuracy percentage.

## Not yet run / not yet possible (as of this file)

- `audit-chart-frontend` — no test files found in the repo; nothing to run.
- Comparison against the hospital's current (manual) process — deferred by
  request; revisit before submission.
- Staff feedback — deferred by request; revisit before submission.
- `/chat` (LLM-in-the-loop) accuracy — only `/suggest` (retrieval-only) was
  evaluated above; the full generation path a coder actually sees was not
  separately scored.
