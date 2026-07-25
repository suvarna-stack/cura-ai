"""End-to-end smoke test: ingest sample corpus, then run a RAG query.

Downloads bge-m3 and Qwen2.5-0.5B on first run. Run from project root:
    python -m scripts.e2e_smoke
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import rag  # noqa: E402
from app.core.vectorstore import get_store  # noqa: E402


def main() -> int:
    corpus = Path(__file__).resolve().parent.parent / "data" / "corpus" / "sample_icd10.md"

    print("== Ingesting sample corpus ==")
    text = corpus.read_text(encoding="utf-8")
    added = rag.ingest_text(text, source=corpus.name, metadata={"path": str(corpus)})
    print(f"  indexed {added} chunks; store now holds {get_store().count()} docs")

    question = "What ICD-10 code is used for Type 2 diabetes with hyperglycemia?"
    print(f"\n== Querying ==\n  Q: {question}")
    result = rag.answer_question(question)

    print(f"\n  A: {result['answer']}")
    print("\n  Retrieved contexts:")
    for c in result["contexts"]:
        print(f"    - [{c['score']:.3f}] {c['source']}: {c['text'][:80]!r}...")

    print("\nE2E OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
