# RAG AI-Accuracy Evaluation — 42 synthetic scenarios (2026-09-18)

Ground truth: `imed-mock-api/scripts/generate_demo_data.py`'s `S` list — each
scenario hardcodes the clinically-intended ICD-10 (and sometimes ICD-9) code
alongside the Thai clinical note text used to build that demo visit. This is
a **synthetic, template-derived gold set**, not real hospital data scored by
a real coder — treat it as a retrieval sanity check on the RAG index, not a
clinical validation study (that requires real hospital records and a human
coder comparison, which is a separate, unfinished item — see Ch.8).

Endpoint tested: `POST /suggest` (retrieval-only; does not use the Qwen LLM).

## Results

- **ICD-10 top-1 accuracy:** 0/42 (0.0%)
- **ICD-10 top-8 (appears anywhere in the suggested list):** 3/42 (7.1%)
- **ICD-9 top-1 accuracy** (of 23 scenarios that have a procedure code): 0/23 (0.0%)
- **ICD-9 top-8:** 1/23 (4.3%)

Raw per-case results: `rag-accuracy-raw.json` (every scenario's chief complaint,
correct code, suggested list, and rank).

## Root cause (confirmed by manual follow-up, not just the harness numbers)

Retrieval is **not broken** — it is excellent on exact-term queries and poor
on natural clinical narratives, which is the actual use case:

- `POST /retrieve {"question": "J00 common cold"}` → top hit is the exact
  correct chunk (`ICD-10-TM-for-PCU.pdf`, page 3, bilingual Thai/English
  quick-reference table), `score: 1.0`, `via: "exact match: J00"`.
- `POST /suggest` with the same visit's actual symptom narrative ("mild
  fever, clear rhinorrhea, sneezing, sore throat, dry cough for 3 days" /
  the Thai equivalent, no code or diagnosis name mentioned) → returns
  unrelated codes (e.g. `B36.9`, `I11`, `I51.4` — skin/cardiac codes) pulled
  from an apparently mis-chunked, index-style region of `S0053.pdf`.

**Interpretation:** the vector index correctly contains and can locate the
right reference text when the query already names the code or diagnosis, but
current chunking/embedding does not bridge "symptom description in plain
language" → "diagnosis code" well enough for the harder, realistic case of a
coder who has a chart but not a pre-known code. This is genuine, actionable
product feedback — a real gap in the RAG pipeline as currently indexed and
chunked, not a defect in this evaluation's methodology.

## Caveats (read before citing this number in Ch.7)

1. **Synthetic gold set.** These scenarios were written by the same team that
   built the RAG index and its underlying reference PDFs; some vocabulary
   overlap between the note text and the retrieval corpus is expected and
   would inflate real-world accuracy estimates.
2. **Retrieval-only.** `/suggest` never invokes the LLM — it extracts ICD
   code tokens directly from retrieved guideline chunks. This measures the
   embedding+retrieval quality, not the full `/chat` reasoning path a coder
   actually sees suggestions from in the app today.
3. **No real hospital comparison yet.** This is not a substitute for scoring
   against real historical hospital coding (Ch.2's Klang et al. methodology)
   — that remains an open gap.
