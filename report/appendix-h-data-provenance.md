# Appendix H — Data provenance detail

*Supporting material for Ch.5 (Data & PDPA) §5.1 — where the demo dataset
came from and why it's synthetic, not real patient data.*

## The generator: `imed-mock-api/scripts/generate_demo_data.py` (1,599 lines)

From its own docstring:

> Grow the mock hospital's demo dataset to ~100 OPD visits, plus a handful
> of IPD admissions, and backfill the columns the original extract left
> empty. [...] It is deterministic (fixed RNG seed), so re-running it
> reproduces byte-identical rows, and it is idempotent: it deletes
> everything it previously generated before rebuilding.

**Every clinical vocabulary is copied from a cited source, not invented:**

| Source | What it supplies |
|---|---|
| `medcode-api/docs/medical-glossary.md` §5 | The ICD-10-TM Volume 5 Standard Coding Guidelines coders are judged against — binds two rules directly: exactly ONE principal diagnosis per visit, and routine work (dressing a wound, an injection, IV fluids, catheterisation) is not coded |
| `medcode-api/docs/medical-glossary.md` §6, §9 | Defined document types; observed department/ward names |
| `medcode-api/docs/MedCode-AI-iMed-Integration-API-Contract-v1.pdf` | Field semantics authority — e.g. `ward` is null for OPD, which is why generated OPD visits carry no ward |
| The 21 original hand-written visits in the seed extract | ID layout, drug label format (drug/strength/form), department strings |

**Internal consistency checks the generator applies:**
- Every ICD code is checked against `imed.icd_10` / `imed.icd_9` before use
  (no invented codes).
- Lab values are keyed to the principal diagnosis, so results support the
  documented assessment (a pneumonia chart doesn't carry a normal white
  count) — because both the human coder and the AI read the lab panel as
  evidence.

**Reproduction**: `python3 scripts/generate_demo_data.py` against a
database at demo start, then `scripts/dump_seed.sh` to regenerate the
committed dump.

## The demo lifecycle: `imed-mock-api/DEMO-SETUP.md` (215 lines)

The runbook covering the full loop end to end:

1. Restore the two demo-ready Postgres dumps (`imed_demo_ready_*.dump`,
   `medcode_demo_ready_*.dump`) — `imed-mock-api/db-backups/`.
2. Take a baseline snapshot (`POST /api/demo/snapshot`) before the first
   sync, so `Settings → Reset` has something to restore to.
3. Demo flow: webapp opens **empty** → Sync pulls ICD catalogs (650
   ICD-10 + 332 ICD-9) and 100 OPD cases (50 pre-coded) → coder codes a
   case with AI suggestions → Approve writes back to the hospital DB →
   Reset restores both databases to baseline. Repeatable indefinitely.

This is the same demo loop the working prototype ships with — no separate
"demo mode" exists; the pilot dataset *is* the real system running against
synthetic data.
