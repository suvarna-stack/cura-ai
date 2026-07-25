"""Unit tests for the chunker — no heavy model deps required."""
from app.core.chunking import chunk_text


def test_short_text_single_chunk():
    assert chunk_text("hello world", 800, 120) == ["hello world"]


def test_empty_text():
    assert chunk_text("   ", 800, 120) == []


def test_long_text_is_split():
    text = ". ".join(f"sentence number {i}" for i in range(300))
    chunks = chunk_text(text, chunk_size=200, overlap=40)
    assert len(chunks) > 1
    # No chunk should be wildly larger than chunk_size + overlap.
    assert all(len(c) <= 200 + 40 + 20 for c in chunks)


def test_overlap_present():
    text = "A" * 500 + ". " + "B" * 500
    chunks = chunk_text(text, chunk_size=300, overlap=50)
    assert len(chunks) >= 2
