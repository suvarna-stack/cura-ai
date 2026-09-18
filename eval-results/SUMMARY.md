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

## Reproduce

```
# terminal 1
cd imed-mock-api && ./mvnw spring-boot:run   # port 8003

# terminal 2
cd medcode-api && ./mvnw test
```

## Not yet run (as of this file)

- RAG service test suite (pytest) — repo has no local venv on this machine;
  needs `pip install -r requirements.txt` (+ pytest) and the bge-m3 embedding
  model, which is a non-trivial download. Needs to be run before Ch.6/7 are
  finalized.
- `audit-chart-frontend` — no test files found in the repo; nothing to run.
- Load/performance testing (response time, throughput under load) — not yet
  done; required explicitly by the Ch.6 rubric.
- AI output accuracy scoring (RAG-suggested ICD codes vs. a labeled gold set)
  — not yet done; required explicitly by the Ch.6 rubric.
- Comparison against the hospital's current (manual) process — not yet done.
- Staff feedback — not yet collected.
