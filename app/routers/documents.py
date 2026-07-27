"""Document ingestion endpoints: upload (background), listing, deletion, rebuild.

Upload flow (mirrors the admin UI's expectations):
  1. validate: PDF must have a text layer (scanned PDFs are rejected with a
     clear message — OCR is out of scope for this service)
  2. save the original file to data/uploads/ (needed for rebuilds)
  3. register the document as "queued" and return immediately
  4. a background task chunks, embeds (slow on CPU) and updates the graph,
     writing progress into the registry — poll GET /documents to watch it
"""
from __future__ import annotations

import io
import logging
import re

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from app.config import get_settings
from app.core import rag, registry
from app.core.vectorstore import get_store
from app.models.schemas import (
    DeleteResponse,
    DocumentInfo,
    ExtractedCode,
    ExtractedCodesResponse,
    IngestResponse,
    IngestTextRequest,
    RebuildResponse,
    UploadResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["documents"])


# --------------------------- upload ---------------------------

@router.post("/upload", response_model=UploadResponse, status_code=202)
async def upload_document(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    source: str | None = Form(None),
    doc_type: str | None = Form(None, description="icd10 | icd9cm | drg | billing"),
    edition: str | None = Form(None, description='e.g. "2024"'),
) -> UploadResponse:
    filename = file.filename or "upload.pdf"
    source = _safe_source(source or filename)
    raw = await file.read()

    pages = _extract_pages(filename, raw)
    total_chars = sum(len(t) for _, t in pages)
    if total_chars < get_settings().min_pdf_chars:
        raise HTTPException(
            status_code=400,
            detail=(
                "No extractable text found — this PDF appears to be scanned images. "
                "Run OCR on it first (e.g. Tesseract), then upload the OCR'd copy."
            ),
        )

    # Keep the original bytes: rebuilds re-ingest from this file.
    saved_path = get_settings().upload_dir / f"{source}.pdf"
    saved_path.write_bytes(raw)

    registry.upsert(
        source,
        filename=filename,
        size_bytes=len(raw),
        pages=len(pages),
        chunks=0,
        status="queued",
        progress=0,
        error=None,
        doc_type=doc_type,
        edition=edition,
    )
    background.add_task(_ingest_job, source)
    return UploadResponse(source=source, status="queued",
                          pages=len(pages), size_bytes=len(raw))


def _ingest_job(source: str) -> None:
    """Background worker: (re)ingest one saved file into vector store + graph."""
    settings = get_settings()
    entry = registry.get(source) or {}
    try:
        registry.upsert(source, status="processing", progress=0)

        # Re-uploading the same source replaces it, never duplicates it.
        rag.remove_source(source)

        raw = (settings.upload_dir / f"{source}.pdf").read_bytes()
        pages = _extract_pages(entry.get("filename", f"{source}.pdf"), raw)

        metadata = {k: v for k, v in
                    {"filename": entry.get("filename"),
                     "doc_type": entry.get("doc_type"),
                     "edition": entry.get("edition")}.items() if v}

        def on_progress(done: int, total: int) -> None:
            registry.upsert(source, progress=int(done * 100 / max(total, 1)))

        added = rag.ingest_pages(pages, source=source, metadata=metadata,
                                 progress_cb=on_progress)
        registry.upsert(source, status="indexed", progress=100, chunks=added)
    except Exception as exc:  # background task: log + record, never raise
        logger.exception("Ingest failed for '%s'", source)
        registry.upsert(source, status="failed", error=str(exc))


# --------------------------- listing ---------------------------

@router.get("", response_model=list[DocumentInfo])
def list_documents() -> list[DocumentInfo]:
    return [DocumentInfo(**d) for d in registry.all_documents()]


# --------------------------- code extraction ---------------------------

# "A09" / "K59.0" at line start, followed by a title starting with a capital
# letter. On a rules manual this only matches worked examples; on a tabular
# code list it matches nearly every line — same endpoint serves both.
_CODE_LINE_RE = re.compile(
    r"^([A-Z]\d{2}(?:\.\d{1,2})?)\s+([A-Z][^\n]{4,120}?)\s*$", re.MULTILINE
)
_CODE_ONLY_RE = re.compile(r"^[A-Z]\d{2}(?:\.\d{1,2})?$")


def _clean_title(raw: str) -> str | None:
    """Normalize an extracted title; None when it isn't a usable description."""
    title = " ".join(raw.split()).rstrip(";,.:")
    # Drop list-continuation tails ("Acute meningococcaemia, or")
    for tail in (" or", " and"):
        if title.endswith(tail):
            title = title[: -len(tail)].rstrip(";,.:")
    # A "description" that is itself a code (or starts with one) is a table
    # artefact ("A34    B37.3"), not a title.
    if len(title) < 5 or _CODE_ONLY_RE.match(title.split()[0]):
        return None
    return title


@router.get("/codes", response_model=ExtractedCodesResponse)
def extract_codes() -> ExtractedCodesResponse:
    """Scan every uploaded document for ICD code + title pairs.

    Read-only and index-independent: works straight off the saved PDFs, so it
    does not need the embedding model. Deduplicated by code (first title wins,
    documents scanned in upload order).
    """
    settings = get_settings()
    seen: dict[str, ExtractedCode] = {}
    scanned = 0
    for doc in registry.all_documents():
        source = doc["source"]
        pdf = settings.upload_dir / f"{source}.pdf"
        if not pdf.exists():
            continue
        scanned += 1
        pages = _extract_pages(doc.get("filename", f"{source}.pdf"), pdf.read_bytes())
        for _, text in pages:
            for code, raw_title in _CODE_LINE_RE.findall(text):
                title = _clean_title(raw_title)
                if title and code not in seen:
                    seen[code] = ExtractedCode(
                        code=code, description=title, source=source
                    )
    return ExtractedCodesResponse(
        documents_scanned=scanned,
        codes=sorted(seen.values(), key=lambda c: c.code),
    )


# --------------------------- raw text (kept for tests / small snippets) -----

@router.post("/text", response_model=IngestResponse)
def ingest_text(req: IngestTextRequest) -> IngestResponse:
    settings = get_settings()
    source = _safe_source(req.source)
    added = rag.ingest_text(req.text, source=source, metadata=req.metadata)
    registry.upsert(source, filename=source, size_bytes=len(req.text),
                    pages=1, chunks=added, status="indexed", progress=100)
    return IngestResponse(source=source, chunks_added=added,
                          collection=settings.collection_name)


# --------------------------- deletion / rebuild ---------------------------

@router.delete("/{source}", response_model=DeleteResponse)
def delete_source(source: str) -> DeleteResponse:
    deleted = rag.remove_source(source)   # Chroma + graph together
    registry.remove(source)
    pdf = get_settings().upload_dir / f"{source}.pdf"
    if pdf.exists():
        pdf.unlink()
    return DeleteResponse(deleted=deleted)


@router.post("/rebuild", response_model=RebuildResponse, status_code=202)
def rebuild_index(background: BackgroundTasks) -> RebuildResponse:
    """Wipe both stores and re-ingest every saved PDF.

    Only needed after changing the embedding model or chunk settings —
    vectors from different models are not comparable. Normal uploads index
    themselves; this is maintenance, not training.
    """
    docs = [d for d in registry.all_documents()
            if (get_settings().upload_dir / f"{d['source']}.pdf").exists()]
    background.add_task(_rebuild_job, [d["source"] for d in docs])
    return RebuildResponse(status="rebuilding", documents=len(docs))


def _rebuild_job(sources: list[str]) -> None:
    from app.core.graphstore import get_graphstore

    get_store().reset()
    get_graphstore().reset()
    for source in sources:
        registry.upsert(source, status="queued", progress=0, chunks=0)
    for source in sources:
        _ingest_job(source)


# --------------------------- helpers ---------------------------

def _safe_source(name: str) -> str:
    """File-system-safe id: strip path components and risky characters."""
    stem = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if stem.lower().endswith(".pdf"):
        stem = stem[:-4]
    return re.sub(r"[^A-Za-z0-9._\- ]+", "_", stem).strip() or "upload"


def _extract_pages(filename: str, raw: bytes) -> list[tuple[int, str]]:
    """Extract per-page text; page numbers feed citations and the graph."""
    if filename.lower().endswith(".pdf"):
        return _extract_pdf_pages(raw)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="ignore")
    return [(1, text)] if text.strip() else []


def _extract_pdf_pages(raw: bytes) -> list[tuple[int, str]]:
    """Best-effort text extract. Hospital PDFs are often slightly corrupt;
    never let one bad page 500 the whole upload. Prefer the extractor that
    yields more text."""
    a = _extract_pdf_pages_pypdf(raw)
    b = _extract_pdf_pages_pymupdf(raw)
    if not a:
        return b
    if not b:
        return a
    return b if sum(len(t) for _, t in b) > sum(len(t) for _, t in a) else a


def _extract_pdf_pages_pypdf(raw: bytes) -> list[tuple[int, str]]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(raw), strict=False)
    except Exception as e:
        logger.warning("pypdf could not open PDF: %s", e)
        return []

    pages: list[tuple[int, str]] = []
    for i, page in enumerate(reader.pages):
        try:
            text = (page.extract_text() or "").strip()
        except Exception as e:
            logger.warning("pypdf skipped page %s: %s", i + 1, e)
            continue
        if len(text) >= 20:  # skip blank / image-only pages
            pages.append((i + 1, text))
    return pages


def _extract_pdf_pages_pymupdf(raw: bytes) -> list[tuple[int, str]]:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return []

    try:
        doc = fitz.open(stream=raw, filetype="pdf")
    except Exception as e:
        logger.warning("pymupdf could not open PDF: %s", e)
        return []

    pages: list[tuple[int, str]] = []
    try:
        for i, page in enumerate(doc):
            try:
                text = (page.get_text("text") or "").strip()
            except Exception as e:
                logger.warning("pymupdf skipped page %s: %s", i + 1, e)
                continue
            if len(text) >= 20:
                pages.append((i + 1, text))
    finally:
        doc.close()
    return pages
