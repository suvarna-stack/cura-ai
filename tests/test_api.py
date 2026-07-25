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
