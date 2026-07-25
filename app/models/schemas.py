"""Pydantic request/response models for the API."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# --------------------------- Ingestion ---------------------------
class IngestTextRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Raw text to index.")
    source: str = Field("inline", description="Logical source name / id.")
    metadata: dict[str, Any] = Field(default_factory=dict)


class IngestResponse(BaseModel):
    source: str
    chunks_added: int
    collection: str


# --------------------------- Query -------------------------------
class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1)
    top_k: int | None = Field(None, ge=1, le=20, description="Override default retrieval depth.")
    temperature: float | None = Field(None, ge=0.0, le=2.0)
    max_new_tokens: int | None = Field(None, ge=16, le=2048)


class RetrievedChunk(BaseModel):
    text: str
    source: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class QueryResponse(BaseModel):
    question: str
    answer: str
    contexts: list[RetrievedChunk]


# --------------------------- Misc --------------------------------
class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    documents: int


class DeleteResponse(BaseModel):
    deleted: int
