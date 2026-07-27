"""Query / chat endpoint — the RAG answer path."""
from __future__ import annotations

import logging

from fastapi import APIRouter

from app.core import rag
from app.models.schemas import (
    QueryRequest,
    QueryResponse,
    RetrievedChunk,
    RetrieveRequest,
    RetrieveResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])


@router.post("/retrieve", response_model=RetrieveResponse)
def retrieve(req: RetrieveRequest) -> RetrieveResponse:
    """Retrieval only — instant answer to "which chunks match?", no LLM."""
    mode, hits = rag.retrieve_chunks(req.question, top_k=req.top_k, mode=req.mode)
    return RetrieveResponse(
        question=req.question,
        mode=mode,
        hits=[
            RetrievedChunk(**{k: v for k, v in h.items() if k != "id"})
            for h in hits
        ],
    )


@router.post("/chat", response_model=QueryResponse)
def query(req: QueryRequest) -> QueryResponse:
    result = rag.answer_question(
        req.question,
        top_k=req.top_k,
        temperature=req.temperature,
        max_new_tokens=req.max_new_tokens,
        mode=req.mode,
    )
    return QueryResponse(
        question=result["question"],
        answer=result["answer"],
        mode=result["mode"],
        contexts=[
            RetrievedChunk(**{k: v for k, v in c.items() if k != "id"})
            for c in result["contexts"]
        ],
    )
