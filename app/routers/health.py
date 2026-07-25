"""Health / status endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.core.vectorstore import get_store
from app.models.schemas import HealthResponse

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
