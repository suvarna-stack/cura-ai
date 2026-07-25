"""Lightweight recursive character text splitter (no heavy deps)."""
from __future__ import annotations

# Try to break on the most semantic boundary available first.
_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


def _split(text: str, separators: list[str], chunk_size: int) -> list[str]:
    """Recursively split `text` into pieces no larger than `chunk_size`."""
    sep = separators[0]
    rest = separators[1:]

    if sep == "":
        # Base case: hard-split by character count.
        return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]

    parts = text.split(sep)
    chunks: list[str] = []
    for part in parts:
        piece = part + sep
        if len(piece) <= chunk_size:
            chunks.append(piece)
        else:
            chunks.extend(_split(part, rest, chunk_size))
    return chunks


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 120) -> list[str]:
    """Split text into overlapping chunks, preserving sentence/paragraph boundaries.

    Small fragments are greedily merged up to ``chunk_size``; consecutive chunks
    share ``overlap`` characters so context is not lost at boundaries.
    """
    text = text.strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    fragments = _split(text, _SEPARATORS, chunk_size)

    # Greedily merge fragments into ~chunk_size windows.
    merged: list[str] = []
    buf = ""
    for frag in fragments:
        if len(buf) + len(frag) <= chunk_size:
            buf += frag
        else:
            if buf.strip():
                merged.append(buf.strip())
            buf = frag
    if buf.strip():
        merged.append(buf.strip())

    if overlap <= 0 or len(merged) <= 1:
        return merged

    # Add trailing overlap from the previous chunk to the start of each chunk.
    with_overlap: list[str] = [merged[0]]
    for i in range(1, len(merged)):
        prev_tail = merged[i - 1][-overlap:]
        with_overlap.append((prev_tail + " " + merged[i]).strip())
    return with_overlap
