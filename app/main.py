"""FastAPI application entry point for the MedCode RAG service."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import chat, documents, health, learn

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Retrieval-Augmented Generation API. "
        "Embeddings: BAAI/bge-m3 (multilingual). "
        "Generation: Qwen2.5-0.5B-Instruct (local). "
        "Vector store: Chroma (persistent)."
    ),
)

# Open CORS for local dev / a front-end (e.g. the sibling audit_chart app).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(learn.router)


@app.get("/", tags=["health"])
def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
    }
