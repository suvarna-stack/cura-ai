"""Document ingestion endpoints: upload (background), listing, deletion, rebuild.

Upload flow (mirrors the admin UI's expectations):
  1. validate: PDF must have a text layer (scanned PDFs are rejected with a
     clear message — OCR is out of scope for this service); CSV must contain
     at least one data row
  2. save the original file to data/uploads/ (needed for rebuilds)
  3. register the document as "queued" and return immediately
  4. a background task chunks, embeds (slow on CPU) and updates the graph,
     writing progress into the registry — poll GET /documents to watch it
"""
from __future__ import annotations

import csv
import io
import logging
import re
from pathlib import Path

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
    RenameRequest,
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
    ext = _ext_of(filename)
    if not ext:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type — upload a PDF or CSV file "
                   "(plain .txt/.md also work).",
        )
    source = _safe_source(source or filename)
    raw = await file.read()

    pages = _extract_pages(filename, raw)
    total_chars = sum(len(t) for _, t in pages)
    if ext == ".pdf" and total_chars < get_settings().min_pdf_chars:
        raise HTTPException(
            status_code=400,
            detail=(
                "No extractable text found — this PDF appears to be scanned images. "
                "Run OCR on it first (e.g. Tesseract), then upload the OCR'd copy."
            ),
        )
    if ext == ".csv" and not pages:
        raise HTTPException(
            status_code=400,
            detail="The CSV file contains no data rows.",
        )
    if ext in (".txt", ".md") and not pages:
        raise HTTPException(
            status_code=400,
            detail="The file contains no extractable text.",
        )

    # Keep the original bytes: rebuilds re-ingest from this file.
    # Same source, different extension replaces the old file (upload of
    # "x.csv" over "x.pdf" must not leave a stale x.pdf behind).
    for other in _ALLOWED_EXTS:
        if other != ext:
            stale = get_settings().upload_dir / f"{source}{other}"
            if stale.exists():
                stale.unlink()
    saved_path = get_settings().upload_dir / f"{source}{ext}"
    saved_path.write_bytes(raw)

    registry.upsert(
        source,
        filename=filename,
        ext=ext,
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
    entry = registry.get(source) or {}
    try:
        registry.upsert(source, status="processing", progress=0)

        # Re-uploading the same source replaces it, never duplicates it.
        rag.remove_source(source)

        saved = _saved_path(source)
        if saved is None:
            raise FileNotFoundError(f"Saved file for '{source}' not found")
        raw = saved.read_bytes()
        pages = _extract_pages(entry.get("filename", saved.name), raw)

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

    Read-only and index-independent: works straight off the saved files, so it
    does not need the embedding model. Deduplicated by code (first title wins,
    documents scanned in upload order). CSVs are parsed column-wise (a cell
    that looks like a code + the longest text cell in the same row); PDFs and
    other text go through the line regex.
    """
    seen: dict[str, ExtractedCode] = {}
    scanned = 0
    for doc in registry.all_documents():
        source = doc["source"]
        saved = _saved_path(source)
        if saved is None:
            continue
        scanned += 1
        raw = saved.read_bytes()
        if saved.suffix.lower() == ".csv":
            for code, title in _codes_from_csv(raw):
                if code not in seen:
                    seen[code] = ExtractedCode(
                        code=code, description=title, source=source
                    )
            continue
        pages = _extract_pages(doc.get("filename", saved.name), raw)
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
    for ext in _ALLOWED_EXTS:
        saved = get_settings().upload_dir / f"{source}{ext}"
        if saved.exists():
            saved.unlink()
    return DeleteResponse(deleted=deleted)


@router.patch("/{source}", response_model=DocumentInfo)
def rename_document(source: str, req: RenameRequest) -> DocumentInfo:
    """Rename a document's display filename.

    Display-only: the source id, saved file, chunk ids and index entries are
    untouched, so no re-embedding is needed. The extension is preserved —
    it drives text extraction on rebuild.
    """
    entry = registry.get(source)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Unknown document '{source}'")

    # Strip path components and characters that could confuse the UI/exports.
    new_name = req.filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    new_name = re.sub(r'[<>:"|?*\x00-\x1f]+', "", new_name).strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Filename must not be empty")

    ext = entry.get("ext") or _ext_of(entry.get("filename", "")) or ".pdf"
    if not new_name.lower().endswith(ext):
        new_name += ext
    updated = registry.upsert(source, filename=new_name)
    return DocumentInfo(**{k: v for k, v in updated.items()
                           if k in DocumentInfo.model_fields})


@router.post("/rebuild", response_model=RebuildResponse, status_code=202)
def rebuild_index(background: BackgroundTasks) -> RebuildResponse:
    """Wipe both stores and re-ingest every saved document.

    Only needed after changing the embedding model or chunk settings —
    vectors from different models are not comparable. Normal uploads index
    themselves; this is maintenance, not training.
    """
    docs = [d for d in registry.all_documents()
            if _saved_path(d["source"]) is not None]
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

_ALLOWED_EXTS = (".pdf", ".csv", ".txt", ".md")
_CSV_ROWS_PER_PAGE = 50   # synthetic "pages" so citations point at row blocks


def _ext_of(filename: str) -> str:
    """The supported extension of a filename, or "" when unsupported."""
    lower = filename.lower()
    for ext in _ALLOWED_EXTS:
        if lower.endswith(ext):
            return ext
    return ""


def _saved_path(source: str) -> Path | None:
    """Locate the saved original for a source, whatever its extension.

    Prefers the extension recorded in the registry; falls back to probing the
    upload dir so entries from before extensions were tracked keep working.
    """
    upload_dir = get_settings().upload_dir
    entry = registry.get(source) or {}
    exts = [entry["ext"]] if entry.get("ext") in _ALLOWED_EXTS else []
    exts += [e for e in _ALLOWED_EXTS if e not in exts]
    for ext in exts:
        path = upload_dir / f"{source}{ext}"
        if path.exists():
            return path
    return None


def _safe_source(name: str) -> str:
    """File-system-safe id: strip path components and risky characters."""
    stem = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    ext = _ext_of(stem)
    if ext:
        stem = stem[: -len(ext)]
    return re.sub(r"[^A-Za-z0-9._\- ]+", "_", stem).strip() or "upload"


def _extract_pages(filename: str, raw: bytes) -> list[tuple[int, str]]:
    """Extract per-page text; page numbers feed citations and the graph."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return _extract_pdf_pages(raw)
    if lower.endswith(".csv"):
        return _extract_csv_pages(raw)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="ignore")
    return [(1, text)] if text.strip() else []


def _decode_csv(raw: bytes) -> str:
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("latin-1", errors="ignore")


def _csv_rows(raw: bytes) -> tuple[list[str], list[list[str]]]:
    """Parse CSV bytes → (header, data rows). Header may be [] when the first
    row doesn't look like column names."""
    text = _decode_csv(raw)
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    rows = [[c.strip() for c in row]
            for row in csv.reader(io.StringIO(text), dialect)
            if any(c.strip() for c in row)]
    if not rows:
        return [], []
    # Header heuristic (csv.Sniffer.has_header is unreliable on small files):
    # a header row has no empty cells, no numbers, and no ICD-code-shaped
    # cells — "code,title" is a header, "A09,Cholera" is data.
    first = rows[0]
    has_header = all(
        c and not c.replace(".", "", 1).isdigit() and not _CSV_CODE_RE.match(c)
        for c in first
    )
    if has_header and len(rows) > 1:
        return rows[0], rows[1:]
    return [], rows


def _extract_csv_pages(raw: bytes) -> list[tuple[int, str]]:
    """Serialize CSV rows into retrievable text.

    Each data row becomes one "Header: value | Header: value" line so every
    chunk carries its column context; rows are grouped into synthetic pages of
    _CSV_ROWS_PER_PAGE so citations ("p.3") point at a row block.
    """
    header, rows = _csv_rows(raw)
    lines: list[str] = []
    for row in rows:
        if header:
            cells = [f"{h}: {v}" for h, v in zip(header, row) if v]
        else:
            cells = [v for v in row if v]
        if cells:
            lines.append(" | ".join(cells))
    pages: list[tuple[int, str]] = []
    for i in range(0, len(lines), _CSV_ROWS_PER_PAGE):
        pages.append((i // _CSV_ROWS_PER_PAGE + 1,
                      "\n".join(lines[i:i + _CSV_ROWS_PER_PAGE])))
    return pages


_CSV_CODE_RE = re.compile(r"^[A-Z]\d{2}(?:\.\d{1,2})?$")


def _codes_from_csv(raw: bytes) -> list[tuple[str, str]]:
    """(code, title) pairs from a CSV: per row, the first cell that looks like
    an ICD code + the longest other text cell as its title."""
    _, rows = _csv_rows(raw)
    out: list[tuple[str, str]] = []
    for row in rows:
        code = next((c for c in row if _CSV_CODE_RE.match(c)), None)
        if not code:
            continue
        title = max((c for c in row if c != code and not _CSV_CODE_RE.match(c)),
                    key=len, default="")
        title = _clean_title(title) if title else None
        if title:
            out.append((code, title))
    return out


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
