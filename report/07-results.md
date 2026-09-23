# Chapter 7 — Results

Verdicts below are judged against what Chapter 1 actually scoped this
deliverable to (OPD-only, synthetic demo data, TRL 4 — "tested as a whole,
on realistic data, with measured numbers" — not a production pilot). Every
figure traces to Chapter 6 / `eval-results/`.

## 7.1 Does the system work end to end?

**Yes, for the OPD demo flow.** Sync → AI-suggested codes → coder
review/edit → approve → write-back to the mock hospital, and reset, all
function (Ch.6.1: 191/192 automated tests pass; the one failure is a test
plumbing issue, not a broken feature — see 6.1). The system holds up under
concurrent load with zero failures at 50 simultaneous clients (Ch.6.2).

## 7.2 Is the AI actually useful for coding, as tested?

**Not yet, on the evidence gathered.** ICD-10 top-1 accuracy on 42
ground-truth scenarios was 0% (Ch.6.3). This is a genuine, specific finding:
retrieval is strong when a query already names a code (score 1.0 on exact
lookups) but does not currently bridge a natural symptom narrative — the
actual shape of input a coder has — to the correct diagnosis code. The
practical implication: **as indexed and chunked today, the RAG suggestion
quality is not yet reliable enough to trust on symptom-only input**, which
is precisely the case coders face. This is worth stating plainly rather than
softening it, because it's the most useful single thing this evaluation
found — a specific, fixable target (chunking/retrieval on narrative text)
rather than a vague "needs more work."

## 7.3 Does it hold up under load?

**Yes, within what was tested.** Zero failed requests at up to 50 concurrent
clients / 2,000 requests against `medcode-api`'s authenticated dashboard
endpoint (Ch.6.2). Not tested: RAG suggestion latency under load, and
concurrent write contention (two coders editing/approving at once) — both
real gaps given the multi-coder design intent (Ch.3).

## 7.4 Results against the objectives (Ch.1 §1.6)

| # | Objective | Result | Evidence |
|---|---|---|---|
| 1 | One worklist showing which visits lack codes | **Met** | Sync loads 140 OPD visits into four mutually exclusive queues (80 complete, 60 incomplete); covered by the automated suites (Ch.6.1) |
| 2 | Code suggestions grounded in the manuals, source shown | **Partly met** | Every suggestion comes from retrieved manual text with its source named, and nothing is invented. But ICD-10 top-1 accuracy is 0/42 and top-8 is 3/42 on symptom narratives (Ch.6.3, §7.2) |
| 3 | The coder stays the decision maker | **Met** | Suggest writes nothing, nothing is pre-ticked, approve is explicit and attributed to the signed-in account, reopen reverses it (Ch.4 §4.3; tests in Ch.6.1) |
| 4 | Approved codes written back into the hospital's records | **Met against the mock** | A diff-based write through the hospital's own API contract, with every row journaled; tested against the contract-faithful mock, **not yet** against the real iMed (Ch.8) |
| 5 | Patient data stays inside the hospital | **Met by design** | No cloud AI calls in the code (Ch.5 §5.3); retrieval and generation run locally. Not verified at the network level |
| 6 | TRL 4: tested as a whole, measured results | **Met** | 191/192 automated tests, load tests with 0 failures up to 50 concurrent clients, a measured AI accuracy baseline (Ch.6) |

Outside the six objectives, two things were **not** evaluated in this
submission: whether the system is faster than manual coding, and how staff
rate it (Ch.6 §6.4). The system has also not been validated against real
hospital data or real coders; every test used synthetic data and team
members (Ch.1 §1.5, Ch.5).

This is a TRL 4 result in the honest sense the assignment asks for: the
system was tested as a whole, on realistic (if synthetic) data, with
measured numbers — some of which are good news (correctness, load headroom)
and one of which is a real, specific problem (narrative-to-code retrieval
accuracy) that a team continuing this project should treat as the next
thing to fix, not paper over.
