"""RAG orchestration: chunk + index on ingest, retrieve + generate on query."""
from __future__ import annotations

import logging
from typing import Any

from app.config import get_settings
from app.core.chunking import chunk_text
from app.core.llm import get_llm
from app.core.vectorstore import get_store

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are MedCode, a careful assistant for medical-coding questions. "
    "Answer ONLY using the provided context. "
    "If the context does not contain the answer, say you don't know. "
    "Be concise and cite the source name(s) in square brackets."
)


def ingest_text(text: str, source: str, metadata: dict[str, Any] | None = None) -> int:
    settings = get_settings()
    chunks = chunk_text(text, settings.chunk_size, settings.chunk_overlap)
    added = get_store().add(chunks, source=source, metadata=metadata)
    logger.info("Ingested %d chunks from source '%s'.", added, source)
    return added


def _build_context(hits: list[dict[str, Any]]) -> str:
    blocks = []
    for i, h in enumerate(hits, 1):
        blocks.append(f"[{i}] (source: {h['source']})\n{h['text']}")
    return "\n\n".join(blocks)


def answer_question(
    question: str,
    top_k: int | None = None,
    temperature: float | None = None,
    max_new_tokens: int | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    top_k = top_k or settings.top_k

    hits = get_store().query(question, top_k=top_k)

    if not hits:
        return {
            "question": question,
            "answer": "I don't have any indexed documents to answer from yet. "
            "Please ingest documents first.",
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
    return {"question": question, "answer": answer, "contexts": hits}
