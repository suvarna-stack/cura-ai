"""Query / chat endpoint — the RAG answer path."""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core import rag
from app.core.suggest import suggest_codes
from app.models.schemas import (
    QueryRequest,
    QueryResponse,
    RetrievedChunk,
    RetrieveRequest,
    RetrieveResponse,
    SuggestRequest,
    SuggestResponse,
    SuggestedCode,
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


@router.post("/suggest", response_model=SuggestResponse)
def suggest(req: SuggestRequest) -> SuggestResponse:
    """ICD-9 + ICD-10 suggestions grounded in the indexed knowledge base."""
    result = suggest_codes(
        req.clinical_text,
        top_k=req.top_k,
        max_per_system=req.max_per_system,
    )
    return SuggestResponse(
        codes=[SuggestedCode(**c) for c in result["codes"]],
        mode=result["mode"],
        hits_used=result["hits_used"],
    )


@router.post("/chat", response_model=QueryResponse)
def query(req: QueryRequest) -> QueryResponse:
    result = rag.answer_question(
        req.question,
        top_k=req.top_k,
        temperature=req.temperature,
        max_new_tokens=req.max_new_tokens,
        mode=req.mode,
        history=[t.model_dump() for t in req.history],
    )
    return QueryResponse(
        question=result["question"],
        answer=result["answer"],
        mode=result["mode"],
        contexts=[
            RetrievedChunk(**{k: v for k, v in c.items() if k != "id"})
            for c in result["contexts"]
        ],
        unverified_codes=result["unverified_codes"],
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/chat/stream")
def query_stream(req: QueryRequest) -> StreamingResponse:
    """SSE variant of /chat. Events, in order:

      {"type": "meta", "mode": ..., "contexts": [...]}   — sources, sent first
      {"type": "delta", "text": "..."}                   — answer pieces
      {"type": "done", "unverified_codes": [...]}        — terminal event
      {"type": "error", "message": "..."}                — terminal on failure
    """
    def gen():
        try:
            for kind, payload in rag.answer_stream(
                req.question,
                top_k=req.top_k,
                temperature=req.temperature,
                max_new_tokens=req.max_new_tokens,
                mode=req.mode,
                history=[t.model_dump() for t in req.history],
            ):
                if kind == "delta":
                    yield _sse({"type": "delta", "text": payload})
                elif kind == "meta":
                    contexts = [
                        RetrievedChunk(
                            **{k: v for k, v in c.items() if k != "id"}
                        ).model_dump()
                        for c in payload["contexts"]
                    ]
                    yield _sse({"type": "meta", "mode": payload["mode"],
                                "contexts": contexts})
                else:
                    yield _sse({"type": "done", **payload})
        except Exception as exc:  # after headers are sent, errors must be events
            logger.exception("chat stream failed")
            yield _sse({"type": "error", "message": str(exc)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
