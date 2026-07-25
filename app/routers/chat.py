"""Query / chat endpoint — the RAG answer path."""
from __future__ import annotations

import logging

from fastapi import APIRouter

from app.core import rag
from app.models.schemas import QueryRequest, QueryResponse, RetrievedChunk

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=QueryResponse)
def query(req: QueryRequest) -> QueryResponse:
    result = rag.answer_question(
        req.question,
        top_k=req.top_k,
        temperature=req.temperature,
        max_new_tokens=req.max_new_tokens,
    )
    return QueryResponse(
        question=result["question"],
        answer=result["answer"],
        contexts=[RetrievedChunk(**c) for c in result["contexts"]],
    )
