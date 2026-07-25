"""Document ingestion endpoints: raw text, file upload (txt/pdf), and deletion."""
from __future__ import annotations

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import get_settings
from app.core import rag
from app.core.vectorstore import get_store
from app.models.schemas import DeleteResponse, IngestResponse, IngestTextRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/text", response_model=IngestResponse)
def ingest_text(req: IngestTextRequest) -> IngestResponse:
    settings = get_settings()
    added = rag.ingest_text(req.text, source=req.source, metadata=req.metadata)
    return IngestResponse(source=req.source, chunks_added=added, collection=settings.collection_name)


@router.post("/upload", response_model=IngestResponse)
async def upload_document(file: UploadFile = File(...), source: str | None = Form(None)) -> IngestResponse:
    settings = get_settings()
    filename = file.filename or "upload"
    source = source or filename
    raw = await file.read()

    text = _extract_text(filename, raw)
    if not text.strip():
        raise HTTPException(status_code=400, detail="No extractable text found in file.")

    added = rag.ingest_text(text, source=source, metadata={"filename": filename})
    return IngestResponse(source=source, chunks_added=added, collection=settings.collection_name)


@router.delete("/{source}", response_model=DeleteResponse)
def delete_source(source: str) -> DeleteResponse:
    deleted = get_store().delete_by_source(source)
    return DeleteResponse(deleted=deleted)


def _extract_text(filename: str, raw: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return _extract_pdf(raw)
    # Default: treat as UTF-8 text.
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("latin-1", errors="ignore")


def _extract_pdf(raw: bytes) -> str:
    import io

    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(raw))
    return "\n\n".join((page.extract_text() or "") for page in reader.pages)
