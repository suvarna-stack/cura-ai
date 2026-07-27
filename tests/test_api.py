"""API smoke tests using FastAPI's TestClient.

The `/chat` and embedding paths are NOT exercised here because they would
download multi-GB models. We test routing, schemas, and the empty-store path.
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["docs"] == "/docs"


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "documents" in body


def test_ingest_validation():
    # Empty text should fail validation (min_length=1).
    r = client.post("/documents/text", json={"text": ""})
    assert r.status_code == 422


def test_stats_endpoint():
    r = client.get("/stats")
    assert r.status_code == 200
    body = r.json()
    assert "chunks_in_index" in body
    assert body["retrieval_mode"] in ("graph", "plain")
    assert "nodes_total" in body["graph"]


def test_list_documents():
    r = client.get("/documents")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_upload_rejects_scanned_pdf():
    # A PDF with one blank page has no text layer -> must be rejected 400.
    import io

    from pypdf import PdfWriter

    buf = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.write(buf)

    r = client.post(
        "/documents/upload",
        files={"file": ("scanned.pdf", buf.getvalue(), "application/pdf")},
    )
    assert r.status_code == 400
    assert "scanned" in r.json()["detail"].lower()


def test_chat_mode_validation():
    r = client.post("/chat", json={"question": "hi", "mode": "banana"})
    assert r.status_code == 422
