"""RAG orchestration: chunk + index + graph on ingest, retrieve + generate on query.

Two retrieval modes:
  plain — top-k cosine similarity (the classic RAG baseline)
  graph — vector search finds seed chunks, then the knowledge graph expands
          one hop along shared codes / sections / citations / reading order
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from app.config import get_settings
from app.core.chunking import chunk_text
from app.core.graphstore import get_graphstore
from app.core.llm import get_llm
from app.core.vectorstore import get_store

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are MedCode, a careful assistant for medical-coding questions. "
    "Answer ONLY using the provided context. "
    "If the context does not contain the answer, say you don't know. "
    "Be concise and cite the source name(s) and page(s) in square brackets."
)


# --------------------------- Ingestion ---------------------------

def ingest_pages(
    pages: list[tuple[int, str]],
    source: str,
    metadata: dict[str, Any] | None = None,
    progress_cb: Callable[[int, int], None] | None = None,
) -> int:
    """Chunk per page, embed into Chroma, and add the document to the graph.

    Chunk ids are deterministic ("{source}:p{page}-c{i}") and shared between
    Chroma and the graph — that identity is what makes graph retrieval work.
    Embedding runs in batches so `progress_cb(done, total)` can drive a
    progress bar during long ingests.
    """
    settings = get_settings()

    records: list[dict[str, Any]] = []
    for page_no, page_text in pages:
        for i, piece in enumerate(chunk_text(page_text, settings.chunk_size,
                                             settings.chunk_overlap)):
            records.append({
                "id": f"{source}:p{page_no}-c{i}",
                "page": page_no,
                "text": piece,
            })
    if not records:
        return 0

    store = get_store()
    batch = settings.ingest_batch_size
    for start in range(0, len(records), batch):
        part = records[start:start + batch]
        store.add(
            chunks=[r["text"] for r in part],
            source=source,
            metadata=metadata,
            ids=[r["id"] for r in part],
            per_chunk_meta=[{"page": r["page"]} for r in part],
        )
        if progress_cb:
            progress_cb(min(start + batch, len(records)), len(records))

    get_graphstore().add_document(source, pages, records)
    logger.info("Ingested %d chunks from source '%s' (vector + graph).",
                len(records), source)
    return len(records)


def ingest_text(text: str, source: str, metadata: dict[str, Any] | None = None) -> int:
    """Back-compat wrapper: treat raw text as a single-page document."""
    return ingest_pages([(1, text)], source=source, metadata=metadata)


def remove_source(source: str) -> int:
    """Delete a document from BOTH stores. Returns chunks removed from Chroma."""
    deleted = get_store().delete_by_source(source)
    get_graphstore().remove_document(source)
    return deleted


# --------------------------- Retrieval ---------------------------

def _plain_hits(question: str, top_k: int) -> list[dict[str, Any]]:
    hits = get_store().query(question, top_k=top_k)
    for h in hits:
        h["via"] = "vector match"
    return hits


def _graph_hits(question: str) -> list[dict[str, Any]]:
    """Seed with vectors, expand along graph edges, keep the best within budget."""
    settings = get_settings()
    store = get_store()

    seed_hits = store.query(question, top_k=settings.seed_k)
    if not seed_hits:
        return []

    seeds = {h["id"]: h["score"] for h in seed_hits}
    expanded = get_graphstore().expand(seeds)
    # A vector hit is valid even if the graph has never heard of it (legacy
    # chunks, drifted stores) — seeds must survive expansion, not be filtered.
    for cid, score in seeds.items():
        expanded.setdefault(cid, (score, "vector match"))

    ranked = sorted(expanded.items(), key=lambda kv: -kv[1][0])[: settings.graph_budget]

    by_id = {h["id"]: h for h in seed_hits}
    need = [cid for cid, _ in ranked if cid not in by_id]
    fetched = store.get_by_ids(need)

    hits: list[dict[str, Any]] = []
    for cid, (score, via) in ranked:
        if cid in by_id:
            h = dict(by_id[cid])
        elif cid in fetched:
            meta = fetched[cid]["metadata"]
            h = {"id": cid, "text": fetched[cid]["text"],
                 "source": meta.get("source", "unknown"), "metadata": meta}
        else:
            continue  # graph knows a chunk Chroma lost — stores drifted; skip
        h["score"] = score
        h["via"] = via
        hits.append(h)
    return hits


def _build_context(hits: list[dict[str, Any]]) -> str:
    blocks = []
    for i, h in enumerate(hits, 1):
        page = h.get("metadata", {}).get("page") or _page_from_id(h.get("id", ""))
        loc = f", p.{page}" if page else ""
        blocks.append(f"[{i}] (source: {h['source']}{loc})\n{h['text']}")
    return "\n\n".join(blocks)


def _page_from_id(cid: str) -> int | None:
    # id format: "{source}:p{page}-c{i}"
    try:
        return int(cid.rsplit(":p", 1)[1].split("-")[0])
    except (IndexError, ValueError):
        return None


def answer_question(
    question: str,
    top_k: int | None = None,
    temperature: float | None = None,
    max_new_tokens: int | None = None,
    mode: str | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    mode = (mode or settings.retrieval_mode).lower()

    if mode == "graph":
        hits = _graph_hits(question)
    else:
        hits = _plain_hits(question, top_k or settings.top_k)

    if not hits:
        return {
            "question": question,
            "answer": "I don't have any indexed documents to answer from yet. "
            "Please ingest documents first.",
            "mode": mode,
            "contexts": [],
        }

    context = _build_context(hits)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"Context:\n{context}\n\nQuestion: {question}",
        },
    ]

    answer = get_llm().generate(
        messages, max_new_tokens=max_new_tokens, temperature=temperature
    )
    return {"question": question, "answer": answer, "mode": mode, "contexts": hits}
