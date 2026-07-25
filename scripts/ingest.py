"""CLI ingestion tool.

Usage:
    python -m scripts.ingest path/to/file.txt [more files ...]
    python -m scripts.ingest data/corpus/            # a whole directory
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure the project root is importable when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import rag  # noqa: E402

SUPPORTED = {".txt", ".md", ".pdf"}


def _read(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        import io

        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(path.read_bytes()))
        return "\n\n".join((p.extract_text() or "") for p in reader.pages)
    return path.read_text(encoding="utf-8", errors="ignore")


def _iter_files(target: Path):
    if target.is_dir():
        for p in sorted(target.rglob("*")):
            if p.is_file() and p.suffix.lower() in SUPPORTED:
                yield p
    else:
        yield target


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1

    total = 0
    for arg in argv:
        for path in _iter_files(Path(arg)):
            text = _read(path)
            added = rag.ingest_text(text, source=path.name, metadata={"path": str(path)})
            print(f"  + {path}  ->  {added} chunks")
            total += added

    print(f"Done. {total} chunks indexed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
