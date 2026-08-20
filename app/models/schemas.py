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
    # read-first priority inside its upload box (1 = read first); None = unranked
    rank: int | None = None
    uploaded_at: str = ""


class RebuildResponse(BaseModel):
    status: str
    documents: int


class RenameRequest(BaseModel):
    """PATCH a document: display filename and/or its upload-box tag.

    Both optional, at least one required. Changing doc_type rewrites the tag
    on every indexed chunk in place (no re-embedding), so retrieval's box
    filter follows immediately.
    """
    filename: str | None = Field(None, min_length=1, max_length=255)
    doc_type: Literal["icd10", "icd9cm"] | None = None


class OrderRequest(BaseModel):
    """Read-first priority for one upload box: sources in reading order."""
    doc_type: Literal["icd10", "icd9cm"]
    sources: list[str] = Field(..., min_length=1)


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
    # Codes the answer cites that appear in NO retrieved chunk — the UI warns
    # instead of trusting them (medical grounding guard).
    unverified_codes: list[str] = Field(default_factory=list)
    # Which upload box retrieval was routed to ("icd10" | "icd9cm"), or None
    # when the question named no system and every chunk was searched.
    code_system: str | None = None


class RetrieveRequest(BaseModel):
    """Retrieval-only test: which chunks would the index hand the LLM?"""
    question: str = Field(..., min_length=1)
    mode: Literal["graph", "plain"] | None = None
    top_k: int | None = Field(None, ge=1, le=20)


class RetrieveResponse(BaseModel):
    question: str
    mode: str
    hits: list[RetrievedChunk]
    # Which upload box retrieval was routed to ("icd10" | "icd9cm"), or None.
    code_system: str | None = None


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
