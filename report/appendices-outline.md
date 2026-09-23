# Appendices — index

*All 8 appendices are now assembled as real files (2026-09-21), not just
pointers. Each is deliberately compact — an index/summary of the source
material with the full source referenced by path — rather than a verbatim
paste, to protect the page budget (`PAGE-COUNT-CHECK.md` found chapters 1–8
alone already near the 40-page cap). If the final page budget allows, the
large source docs (`api-contract.md`, `DEPLOYMENT-PREP.md`, etc.) can be
attached in full instead; each appendix says which file that would be.*

| Appendix | File | Status |
|---|---|---|
| A — API reference | `appendix-a-api-reference.md` | Assembled: 33-endpoint index + linked source docs |
| B — Architecture & data-flow | `appendix-b-architecture.md` | Assembled: 2 diagram figures embedded + port table |
| C — Database schema | `appendix-c-database-schema.md` | Assembled: full migration list (both DBs) + glossary pointer |
| D — Test cases / evidence | `appendix-d-test-evidence.md` | Assembled: suite results table + RAG test breakdown |
| E — Questionnaires | *Cut from this submission (2026-09-23)* | Instrument (`appendix-e-questionnaire.md`) exists in the repo but is **not included in the submitted report** — never administered to a real coder, so there's no data to present; kept out to finish on deadline rather than ship an empty/incomplete section |
| F — Screenshots | `appendix-f-screenshots.md` | Assembled: 24-image index (21 Thai/coder + 1 admin + 2 architecture figures) |
| G — Production-readiness checklist | `appendix-g-production-readiness.md` | Assembled: TLDR + section index of `DEPLOYMENT-PREP.md` |
| H — Data provenance | `appendix-h-data-provenance.md` | Assembled: generator sourcing table + demo lifecycle |

## Still open

- **Page budget**: confirm with whoever set the requirement whether
  appendices count toward the 25–40 page target (not stated in the
  deliverable spec) — see `PAGE-COUNT-CHECK.md`.

## Cut from this submission (2026-09-23, deadline pressure)

Three items were deliberately dropped rather than left half-finished, since
none could be completed with real evidence before the deadline:
- Staff/coder feedback (Appendix E questionnaire — instrument exists,
  never administered)
- Manual-vs-AI and hospital-process comparison (Ch.6 §6.4 in earlier
  drafts — team-timed sample + external literature, cut rather than
  presented as validation)
- Separate `/chat` (LLM-in-the-loop) accuracy scoring — blocked on a broken
  Ollama model download, not fixed under time pressure

All three are noted as explicit, reasoned scope cuts in `06-testing-evaluation.md`
§6.4 ("What was not tested"), not silently dropped.
