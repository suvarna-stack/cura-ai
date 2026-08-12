"""Pydantic request/response models for the API."""
from __future__ import annotations

from typing import Any, Literal

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


class UploadResponse(BaseModel):
    """Upload is accepted and ingested in the background — poll GET /documents."""
    source: str
    status: str
    pages: int
    size_bytes: int


class DocumentInfo(BaseModel):
    source: str
    filename: str = ""
    size_bytes: int = 0
    pages: int = 0
    chunks: int = 0
    status: str = "queued"           # queued | processing | indexed | failed
    progress: int = 0                # 0-100, meaningful while processing
    error: str | None = None
    doc_type: str | None = None      # e.g. icd10 | icd9cm | drg | billing
    edition: str | None = None       # e.g. "2024"
    uploaded_at: str = ""


class RebuildResponse(BaseModel):
    status: str
    documents: int


class RenameRequest(BaseModel):
    """Change a document's display filename (source id and index untouched)."""
    filename: str = Field(..., min_length=1, max_length=255)


# --------------------------- Query -------------------------------
class ChatTurn(BaseModel):
    """One prior conversation turn, OpenAI-style."""
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=8000)


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1)
    history: list[ChatTurn] = Field(
        default_factory=list, max_length=40,
        description="Prior turns, oldest first; only the most recent "
                    "chat_history_turns are fed to the LLM.",
    )
    mode: Literal["graph", "plain"] | None = Field(
        None, description="Retrieval strategy; default from settings (graph)."
    )
    top_k: int | None = Field(None, ge=1, le=20, description="Override default retrieval depth.")
    temperature: float | None = Field(None, ge=0.0, le=2.0)
    max_new_tokens: int | None = Field(None, ge=16, le=2048)


class RetrievedChunk(BaseModel):
    text: str
    source: str                      # immutable source id (chunk metadata)
    display_name: str = ""           # current display filename from the registry
    score: float
    via: str = "vector match"        # why this chunk is here (graph explanation)
    metadata: dict[str, Any] = Field(default_factory=dict)


class QueryResponse(BaseModel):
    question: str
    answer: str
    mode: str
    contexts: list[RetrievedChunk]


class RetrieveRequest(BaseModel):
    """Retrieval-only test: which chunks would the index hand the LLM?"""
    question: str = Field(..., min_length=1)
    mode: Literal["graph", "plain"] | None = None
    top_k: int | None = Field(None, ge=1, le=20)


class RetrieveResponse(BaseModel):
    question: str
    mode: str
    hits: list[RetrievedChunk]


# --------------------------- Misc --------------------------------
class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    documents: int


class GraphStats(BaseModel):
    nodes_total: int
    edges_total: int
    nodes: dict[str, int] = Field(default_factory=dict)
    edges: dict[str, int] = Field(default_factory=dict)


class StatsResponse(BaseModel):
    documents_indexed: int
    chunks_in_index: int
    embed_model: str
    llm_model: str
    retrieval_mode: str
    graph: GraphStats


class DeleteResponse(BaseModel):
    deleted: int


class ExtractedCode(BaseModel):
    """A code + official title pair found in an uploaded reference document."""
    code: str
    system: str = "ICD-10"
    description: str
    source: str                      # which document it came from


class ExtractedCodesResponse(BaseModel):
    documents_scanned: int
    codes: list[ExtractedCode]


# --------------------------- Suggest (case coding) ---------------------------
class SuggestRequest(BaseModel):
    """Clinical narrative from a case report → ICD-9 / ICD-10 suggestions."""
    clinical_text: str = Field(..., min_length=1)
    top_k: int | None = Field(None, ge=1, le=20)
    max_per_system: int = Field(8, ge=1, le=20)


class SuggestedCode(BaseModel):
    code: str
    system: Literal["ICD-10", "ICD-9"]
    description: str
    confidence: int = Field(..., ge=0, le=100)
    source: str = ""


class SuggestResponse(BaseModel):
    codes: list[SuggestedCode]
    mode: str
    hits_used: int = 0
