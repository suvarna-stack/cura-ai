"""RAG orchestration: chunk + index + graph on ingest, retrieve + generate on query.

Two retrieval modes:
  plain — top-k cosine similarity (the classic RAG baseline)
  graph — vector search finds seed chunks, then the knowledge graph expands
          one hop along shared codes / sections / citations / reading order
"""
from __future__ import annotations

import logging
import re
from typing import Any, Callable, Iterator

from app.config import get_settings
from app.core import registry
from app.core.chunking import chunk_text
from app.core.graphstore import get_graphstore
from app.core.llm import get_llm
from app.core.vectorstore import get_store

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are MedCode, a careful assistant for medical-coding questions. "
    "Answer ONLY using the provided context. "
    "If the context does not contain the answer, say you don't know. "
    "Be concise — at most about 120 words — and cite the source name(s) "
    "and page(s) in square brackets. "
    "Always answer in the same language the question was asked in — "
    "English questions get English answers, Thai questions get Thai answers "
    "(ตอบเป็นภาษาไทยเมื่อผู้ใช้ถามเป็นภาษาไทย)."
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


def _is_thai(text: str) -> bool:
    """True when the text contains Thai script (U+0E00–U+0E7F)."""
    return any("฀" <= ch <= "๿" for ch in text)


# ICD-10: letter + 2 digits + optional decimals ("I33", "K59.0"). ICD-9
# procedure codes are bare numbers, so the decimal point is required there
# ("39.95") to avoid matching every number in a sentence.
_ICD10_RE = re.compile(r"\b[A-Z]\d{2}(?:\.\d{1,3})?\b")
_ICD9_RE = re.compile(r"\b\d{2,3}\.\d{1,2}\b")

# Retrieval can now merge two channels (exact code matches + semantic hits);
# cap the union so the prompt stays small enough for CPU-budget latency.
_MAX_CONTEXT_CHUNKS = 8


def _codes_in(text: str) -> list[str]:
    """ICD-shaped tokens in reading order, deduplicated."""
    seen: list[str] = []
    for m in (*_ICD10_RE.findall(text), *_ICD9_RE.findall(text)):
        if m not in seen:
            seen.append(m)
    return seen


def _code_hits(question: str) -> list[dict[str, Any]]:
    """Exact-substring chunks for codes named in the question.

    "what is I33" is a lookup, not a semantic question — embeddings are weak
    at short code strings, so fetch the literal entries and put them first.
    """
    hits: list[dict[str, Any]] = []
    for code in _codes_in(question)[:3]:
        for h in get_store().find_text(code, limit=2):
            h["via"] = f"exact match: {code}"
            hits.append(h)
    return hits


def _verify_codes(answer: str, hits: list[dict[str, Any]]) -> list[str]:
    """Codes the answer mentions that appear in NO retrieved chunk.

    The grounding guarantee for medical use: anything the model cited that its
    sources never contained gets flagged to the user instead of trusted.
    """
    context = "\n".join(h.get("text", "") for h in hits)
    ctx_codes = set(_codes_in(context))
    return [c for c in _codes_in(answer) if c not in ctx_codes]


def _attach_display_names(hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Chunk metadata carries the immutable source id; the registry owns the
    (renameable) display filename. Resolve it once per query so citations
    follow renames without touching the index."""
    if not hits:
        return hits
    names = {d["source"]: d.get("filename") or d["source"]
             for d in registry.all_documents()}
    for h in hits:
        h["display_name"] = names.get(h["source"], h["source"])
    return hits


def _build_context(hits: list[dict[str, Any]]) -> str:
    blocks = []
    for i, h in enumerate(hits, 1):
        page = h.get("metadata", {}).get("page") or _page_from_id(h.get("id", ""))
        loc = f", p.{page}" if page else ""
        name = h.get("display_name") or h["source"]
        blocks.append(f"[{i}] (source: {name}{loc})\n{h['text']}")
    return "\n\n".join(blocks)


def _page_from_id(cid: str) -> int | None:
    # id format: "{source}:p{page}-c{i}"
    try:
        return int(cid.rsplit(":p", 1)[1].split("-")[0])
    except (IndexError, ValueError):
        return None


def retrieve_chunks(
    question: str,
    top_k: int | None = None,
    mode: str | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Retrieval only — no LLM generation. Returns (resolved_mode, hits)."""
    settings = get_settings()
    mode = (mode or settings.retrieval_mode).lower()

    if mode == "graph":
        hits = _graph_hits(question)
    else:
        hits = _plain_hits(question, top_k or settings.top_k)

    # Exact code matches outrank semantic hits: they ARE the answer for
    # dictionary-style questions, and they anchor the model on real entries.
    code_hits = _code_hits(question)
    if code_hits:
        seen_ids = {h["id"] for h in code_hits}
        hits = code_hits + [h for h in hits if h.get("id") not in seen_ids]
    return mode, _attach_display_names(hits[:_MAX_CONTEXT_CHUNKS])


_EMPTY_INDEX_MSG = ("I don't have any indexed documents to answer from yet. "
                    "Please ingest documents first.")


def _prepare(
    question: str,
    top_k: int | None,
    mode: str | None,
    history: list[dict[str, str]],
) -> tuple[str, list[dict[str, Any]], list[dict[str, str]] | None]:
    """Shared retrieval + prompt assembly for the blocking and streaming paths.

    Returns (mode, hits, messages); messages is None when the index is empty.
    """
    # Follow-up questions ("what about for children?") are meaningless to the
    # retriever alone — prepend the previous user turn so the vector query
    # carries the topic.
    retrieval_query = question
    prev_user = next((t["content"] for t in reversed(history)
                      if t["role"] == "user"), None)
    if prev_user:
        retrieval_query = f"{prev_user}\n{question}"

    mode, hits = retrieve_chunks(retrieval_query, top_k=top_k, mode=mode)
    if not hits:
        return mode, [], None

    context = _build_context(hits)
    keep = get_settings().chat_history_turns
    # Small models follow the context's language over a distant system line —
    # an explicit instruction adjacent to the question is what actually works.
    # Symmetric on purpose: an English question must not drift into Thai either.
    lang_note = (
        "\n\nสำคัญ: ตอบเป็นภาษาไทยเท่านั้น ห้ามตอบเป็นภาษาอังกฤษ "
        "(IMPORTANT: Answer in Thai ONLY. Do not answer in English.)"
        if _is_thai(question)
        else "\n\nIMPORTANT: Answer in English only."
    )
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history[-keep:],
        {
            "role": "user",
            "content": f"Context:\n{context}\n\nQuestion: {question}{lang_note}",
        },
    ]
    return mode, hits, messages


def answer_question(
    question: str,
    top_k: int | None = None,
    temperature: float | None = None,
    max_new_tokens: int | None = None,
    mode: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    mode, hits, messages = _prepare(question, top_k, mode, history or [])
    if messages is None:
        return {"question": question, "answer": _EMPTY_INDEX_MSG,
                "mode": mode, "contexts": [], "unverified_codes": []}

    answer = get_llm().generate(
        messages, max_new_tokens=max_new_tokens, temperature=temperature
    )
    return {"question": question, "answer": answer, "mode": mode,
            "contexts": hits, "unverified_codes": _verify_codes(answer, hits)}


def answer_stream(
    question: str,
    top_k: int | None = None,
    temperature: float | None = None,
    max_new_tokens: int | None = None,
    mode: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> Iterator[tuple[str, Any]]:
    """Streaming twin of answer_question.

    Yields ("meta", {mode, contexts}) once, then ("delta", text) pieces as the
    LLM generates, then ("done", {unverified_codes}) — contexts go out first so
    the UI can show sources while the answer is still typing.
    """
    mode, hits, messages = _prepare(question, top_k, mode, history or [])
    yield "meta", {"mode": mode, "contexts": hits}
    if messages is None:
        yield "delta", _EMPTY_INDEX_MSG
        yield "done", {"unverified_codes": []}
        return

    parts: list[str] = []
    for piece in get_llm().generate_stream(
        messages, max_new_tokens=max_new_tokens, temperature=temperature
    ):
        parts.append(piece)
        yield "delta", piece
    answer = "".join(parts)
    yield "done", {"unverified_codes": _verify_codes(answer, hits)}
