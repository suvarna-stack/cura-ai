"""Document registry: which files are indexed, their status and progress.

Chroma stores chunks and the graph stores structure, but neither remembers
"ICD-10 2024.pdf, 4.6 MB, 105 pages, uploaded 2 June, indexed". That is this
file's job — a small JSON store at `data/documents.json`, safe to read from
the API while a background ingest is writing progress into it.

Statuses mirror the admin UI: queued -> processing -> indexed | failed.
"""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from typing import Any

from app.config import get_settings

_lock = threading.Lock()


def _load() -> dict[str, dict[str, Any]]:
    path = get_settings().registry_path
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save(data: dict[str, dict[str, Any]]) -> None:
    path = get_settings().registry_path
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def upsert(source: str, **fields: Any) -> dict[str, Any]:
    """Create or update a document entry; returns the stored entry."""
    with _lock:
        data = _load()
        entry = data.get(source, {"source": source,
                                  "uploaded_at": datetime.now(timezone.utc).isoformat()})
        entry.update(fields)
        data[source] = entry
        _save(data)
        return entry


def get(source: str) -> dict[str, Any] | None:
    with _lock:
        return _load().get(source)


def all_documents() -> list[dict[str, Any]]:
    with _lock:
        docs = list(_load().values())
    return sorted(docs, key=lambda d: d.get("uploaded_at", ""), reverse=True)


def remove(source: str) -> bool:
    with _lock:
        data = _load()
        if source not in data:
            return False
        del data[source]
        _save(data)
        return True
