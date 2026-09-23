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

## 7.4 Summary against the deliverable's own scope (Ch.1 §1.5)

| Scoped claim | Status |
|---|---|
| OPD demo flow runs end to end | Confirmed (7.1) |
| System handles realistic concurrent load | Confirmed, within tested range (7.3) |
| AI suggestions are clinically useful on symptom input | **Not confirmed — active gap, root cause identified (7.2)** |
| Faster than manual coding | **Out of scope for this submission — see Ch.6.4** |
| Validated against real hospital data/coders | **Not done — synthetic data and team-only testing throughout (Ch.1 §1.5, Ch.5)** |

This is a TRL 4 result in the honest sense the assignment asks for: the
system was tested as a whole, on realistic (if synthetic) data, with
measured numbers — some of which are good news (correctness, load headroom)
and one of which is a real, specific problem (narrative-to-code retrieval
accuracy) that a team continuing this project should treat as the next
thing to fix, not paper over.
