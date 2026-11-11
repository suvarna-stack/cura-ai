"""Score /suggest against cases with known correct codes (step 4).

    python -m scripts.eval_suggest                         # 42 synthetic cases
    python -m scripts.eval_suggest --view no-assessment    # harder: no diagnosis
    python -m scripts.eval_suggest --gold data/cases/approved_cases.jsonl \\
        --memory loo                                       # real approved cases
    python -m scripts.eval_suggest --out eval-results/x.json

Runs suggest_codes in-process. Coder-taught rules are switched off so the
score is the machine's own. By default the old PDF-scraping fallback is off
too (it needs the embedding model); pass --with-rag on a machine that has it.

Gold file: one JSON per line with ``sections`` (or ``text``), ``icd10`` and
``icd9`` lists, first code = principal (same format as approved_cases.jsonl).

--memory: "none" (default for the synthetic set), "file" (use
data/cases/approved_cases.jsonl as it is), or "loo" (use the gold file
itself as the memory, leaving each case out while it is scored — the honest
way to test step 3 on real cases).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.core import case_memory, learn, suggest  # noqa: E402

DEFAULT_GOLD = ROOT / "eval" / "gold_synthetic_42.jsonl"


def load(path: Path) -> list[dict]:
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def view_text(rec: dict, view: str) -> str:
    rec = dict(rec)
    if view == "no-assessment" and rec.get("sections"):
        rec["sections"] = {k: v for k, v in rec["sections"].items()
                           if k.lower() not in ("assessment", "diagnosis", "impression")}
    if view == "complaint-only" and rec.get("sections"):
        rec["sections"] = {k: v for k, v in rec["sections"].items()
                           if k.lower() in ("chief complaint", "present illness")}
    return case_memory.case_text(rec)


def rank_of(code: str, codes: list[str]) -> int | None:
    return codes.index(code) + 1 if code in codes else None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gold", type=Path, default=DEFAULT_GOLD)
    ap.add_argument("--view", choices=("full", "no-assessment", "complaint-only"),
                    default="full")
    ap.add_argument("--memory", choices=("none", "file", "loo"), default="none")
    ap.add_argument("--with-rag", action="store_true")
    ap.add_argument("--out", type=Path)
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)

    gold = load(args.gold)
    learn.match_notes = lambda text, limit=3: []          # machine only
    learn.bump_hits = lambda ids: None
    if not args.with_rag:
        suggest.retrieve_chunks = lambda *a, **k: ("off", [])
    if args.memory == "none":
        case_memory.set_memory(case_memory.CaseMemory([]))
    elif args.memory == "loo":
        full = case_memory.CaseMemory(gold)

    rows = []
    t0 = time.time()
    for rec in gold:
        if args.memory == "loo":
            case_memory.set_memory(case_memory.CaseMemory(
                [c for c in full.cases if c.get("id") != rec.get("id")]))
        out = suggest.suggest_codes(view_text(rec, args.view))
        s10 = [c["code"] for c in out["codes"] if c["system"] == "ICD-10"]
        s9 = [c["code"] for c in out["codes"] if c["system"] == "ICD-9"]
        g10, g9 = rec.get("icd10") or [], rec.get("icd9") or []
        row = {
            "id": rec.get("id"),
            "gold_icd10": g10, "gold_icd9": g9,
            "icd10_suggested": s10, "icd9_suggested": s9,
            "icd10_rank": rank_of(g10[0], s10) if g10 else None,
            "icd9_rank": rank_of(g9[0], s9) if g9 else None,
            "icd10_all_found": sum(1 for c in g10 if c in s10),
            "why_top": out["codes"][0]["source"] if out["codes"] else "",
        }
        rows.append(row)
        if args.verbose:
            print(f'{row["id"]}: {g10[:1]} rank={row["icd10_rank"]}  '
                  f'{g9[:1]} rank={row["icd9_rank"]}  top={s10[:3]} {s9[:2]}')

    def at(k, key, subset):
        return sum(1 for r in subset if r[key] is not None and r[key] <= k)

    with10 = [r for r in rows if r["gold_icd10"]]
    with9 = [r for r in rows if r["gold_icd9"]]
    no9 = [r for r in rows if not r["gold_icd9"]]
    summary = {
        "gold": str(args.gold.name), "view": args.view, "memory": args.memory,
        "rag_fallback": args.with_rag, "cases": len(rows),
        "icd10": {k: at(n, "icd10_rank", with10) for k, n in (("top1", 1), ("top3", 3), ("top8", 8))},
        "icd10_cases": len(with10),
        "icd9": {k: at(n, "icd9_rank", with9) for k, n in (("top1", 1), ("top3", 3), ("top8", 8))},
        "icd9_cases": len(with9),
        "icd9_codes_offered_when_none_done": round(
            sum(len(r["icd9_suggested"]) for r in no9) / max(1, len(no9)), 2),
        "seconds": round(time.time() - t0, 1),
    }
    pct = lambda a, b: f"{a}/{b} ({100 * a / max(1, b):.0f}%)"
    print(f"\n{summary['gold']}  view={args.view}  memory={args.memory}  "
          f"rag_fallback={args.with_rag}")
    for k in ("top1", "top3", "top8"):
        print(f"  ICD-10 {k}: {pct(summary['icd10'][k], len(with10))}   "
              f"ICD-9 {k}: {pct(summary['icd9'][k], len(with9))}")
    print(f"  ICD-9 codes offered on cases with no procedure: "
          f"{summary['icd9_codes_offered_when_none_done']} per case")
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps({"summary": summary, "cases": rows},
                                       ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
