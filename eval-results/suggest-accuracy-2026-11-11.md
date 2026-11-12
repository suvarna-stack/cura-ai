# /suggest accuracy after the codebook rewrite (2026-11-11)

Same 42 synthetic cases as the September test (`ai/eval/gold_synthetic_42.jsonl`,
built from `imed-mock-api/scripts/generate_demo_data.py`). Run with:

    cd ai && python -m scripts.eval_suggest --view full

Settings: coder rules off, LLM off (rules only), old PDF fallback off, no
approved-case memory. So this is the **floor** of the new pipeline.

## Results

| Chart given to the AI | ICD-10 top-1 | ICD-10 top-3 | ICD-9 top-1 | ICD-9 top-3 |
|---|---|---|---|---|
| September, old method | 0/42 (0%) | — | 0/23 (0%) | — |
| Full chart (with the doctor's Assessment) | **34/42 (81%)** | 38/42 (90%) | **16/23 (70%)** | 18/23 (78%) |
| No Assessment (complaint, history, exam, plan) | 2/42 (5%) | 4/42 (10%) | 16/23 (70%) | 17/23 (74%) |
| Complaint + history only | 2/42 (5%) | 4/42 (10%) | 0/23 | 0/23 |

Raw per-case output: `suggest-accuracy-2026-11-11-<view>.json`.

## What this means

- When the chart has a written diagnosis, the new method finds the right
  code first 4 times out of 5. The old method never did.
- When the chart has **no** diagnosis, rules alone cannot guess one from
  Thai symptoms (5%). That needs the local LLM step
  (`SUGGEST_LLM_EXTRACT=on` with Ollama) and the approved-case memory.
  Neither was measured here: no model runs in this test environment, and
  there are no real approved cases yet. Measure both on the laptop / server.
- 0.74 ICD-9 codes per case are offered for visits with no procedure in
  the gold set. Some are real procedures the gold set leaves out
  (ear irrigation, physiotherapy).

## Gold labels worth a coder's check

In 4 "misses" the new answer looks more correct than the gold code. A
coder should decide before these numbers are quoted:

| Case | Chart says | Gold | New top answer |
|---|---|---|---|
| syn-23 | Chronic maxillary sinusitis | J32.9 (unspecified) | J32.0 (maxillary) |
| syn-27 | Migraine without aura | G43.9 (unspecified) | G43.0 (without aura) |
| syn-34 | Chronic pelvic pain | R10.4 | R10.2 (pelvic and perineal pain) |
| syn-35 | Breast mass, before pathology | C50.9 (cancer) | N63 (lump in breast) |

## Caveats

- Synthetic, template-written cases, by the same team. Not a clinical
  validation. The real test is `--gold data/cases/approved_cases.jsonl
  --memory loo` on cases the MFU coders approved
  (export: `backend/scripts/export_approved_cases.sql`).
- In production the old PDF search still runs for a column the chart gave
  nothing for (`SUGGEST_RAG_FALLBACK=true`), ranked last. It is the method
  that scored 0%; set it to false once the LLM step is on.
- The test charts are written the way `generate_demo_data.py` writes them
  ("Assessment: ..." lines). If real iMed charts label sections differently,
  `ai/app/core/extract.py` `_LABELS` needs those labels.
