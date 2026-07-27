"""Health / status endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.core import registry
from app.core.graphstore import get_graphstore
from app.core.vectorstore import get_store
from app.models.schemas import GraphStats, HealthResponse, StatsResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    try:
        docs = get_store().count()
    except Exception:
        docs = 0
    return HealthResponse(
        status="ok",
        app=settings.app_name,
        version=settings.app_version,
        documents=docs,
    )


@router.get("/stats", response_model=StatsResponse)
def stats() -> StatsResponse:
    """Numbers for the admin dashboard tiles: index size + graph shape."""
    settings = get_settings()
    try:
        chunks = get_store().count()
    except Exception:
        chunks = 0
    indexed = sum(1 for d in registry.all_documents() if d.get("status") == "indexed")
    return StatsResponse(
        documents_indexed=indexed,
        chunks_in_index=chunks,
        embed_model=settings.embed_model,
        llm_model=settings.llm_model,
        retrieval_mode=settings.retrieval_mode,
        graph=GraphStats(**get_graphstore().stats()),
    )
