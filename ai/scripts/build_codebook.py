"""Build data/codebook/codebook.json: one entry per ICD code.

    python -m scripts.build_codebook            # defaults below
    python -m scripts.build_codebook --report   # also print coverage numbers

Sources, most trusted first (the first title seen for a code wins, the rest
become search terms):

1. data/codebook/*.csv  — code tables in the plain CSV format
   (code, system, title_en, title_th, terms). Put the hospital's own
   ICD-10-TM / ICD-9-CM tables here when they arrive. imed_catalog.csv is
   the iMed catalog the backend already syncs.
2. The ICD-10-TM for PCU PDF — bilingual quick-reference tables (Thai names).
3. The ICD-9-CM PDF — Volume 3 tabular list, with inclusion terms.

The WHO rules volume (S0053) is NOT a source: it holds coding rules, not a
code list, and scraping it is what put B36.9 / I11 into unrelated cases.
"""
from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.core import codebook as cb  # noqa: E402

UPLOADS = ROOT / "data" / "uploads"
CODEBOOK_DIR = ROOT / "data" / "codebook"


def pdf_pages(path: Path) -> list[str]:
    import pymupdf  # same tolerant reader the upload path falls back to

    pymupdf.TOOLS.mupdf_display_errors(False)   # the ICD-9 PDF has noisy streams

    with pymupdf.open(path) as doc:
        return [page.get_text() for page in doc]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--bilingual", type=Path, default=UPLOADS / "ICD-10-TM-for-PCU.pdf")
    ap.add_argument("--icd9", type=Path, default=UPLOADS / "icd9.pdf")
    ap.add_argument("--csv-dir", type=Path, default=CODEBOOK_DIR)
    ap.add_argument("--out", type=Path, default=CODEBOOK_DIR / "codebook.json")
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args(argv)

    entries: list[cb.Entry] = []
    counts: Counter = Counter()

    for f in sorted(args.csv_dir.glob("*.csv")):
        with f.open(encoding="utf-8-sig", newline="") as fh:
            got = cb.parse_catalog_csv(csv.DictReader(fh), f.stem)
        entries += got
        counts[f.name] = len(got)

    if args.bilingual.exists():
        got = cb.parse_bilingual_pages(pdf_pages(args.bilingual), args.bilingual.stem)
        entries += got
        counts[args.bilingual.name] = len(got)
    else:
        print(f"skip: {args.bilingual} not found")

    if args.icd9.exists():
        got = cb.parse_icd9_tabular(pdf_pages(args.icd9), args.icd9.stem)
        entries += got
        counts[args.icd9.name] = len(got)
    else:
        print(f"skip: {args.icd9} not found")

    merged = cb.merge_entries(entries)
    path = cb.save(merged.values(), args.out)

    by_sys = Counter(e.system for e in merged.values())
    with_th = sum(1 for e in merged.values() if e.title_th)
    print(f"wrote {path}")
    print(f"  ICD-10 codes: {by_sys[cb.ICD10]}  (with Thai name: {with_th})")
    print(f"  ICD-9 codes:  {by_sys[cb.ICD9]}")
    if args.report:
        for name, n in counts.items():
            print(f"  from {name}: {n} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
