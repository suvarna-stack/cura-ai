"""Persistent Chroma vector store wrapper.

Embeddings are computed by our own bge-m3 `Embedder` and passed to Chroma
explicitly, so Chroma never tries to download its default embedding model.
"""
from __future__ import annotations

import logging
import threading
import uuid
from typing import Any

from app.config import get_settings
from app.core.embeddings import get_embedder

logger = logging.getLogger(__name__)


class VectorStore:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._client = None
        self._collection = None
        self._lock = threading.Lock()

    def _ensure_collection(self):
        if self._collection is None:
            with self._lock:
                if self._collection is None:
                    import chromadb
                    from chromadb.config import Settings as ChromaSettings

                    self._client = chromadb.PersistentClient(
                        path=str(self._settings.chroma_dir),
                        settings=ChromaSettings(anonymized_telemetry=False),
                    )
                    self._collection = self._client.get_or_create_collection(
                        name=self._settings.collection_name,
                        metadata={"hnsw:space": "cosine"},
                    )
                    logger.info(
                        "Chroma collection '%s' ready (%d docs).",
                        self._settings.collection_name,
                        self._collection.count(),
                    )
        return self._collection

    # ------------------------------------------------------------------
    def add(
        self,
        chunks: list[str],
        source: str,
        metadata: dict[str, Any] | None = None,
        ids: list[str] | None = None,
        per_chunk_meta: list[dict[str, Any]] | None = None,
    ) -> int:
        """Embed and store chunks.

        Pass `ids` to use deterministic ids (the graph store relies on chunk
        ids being shared between Chroma and the graph); otherwise random ids
        are generated. `per_chunk_meta` merges extra fields (e.g. page number)
        into each chunk's metadata.
        """
        if not chunks:
            return 0
        collection = self._ensure_collection()
        embedder = get_embedder()

        vectors = embedder.embed_documents(chunks)
        base_meta = {"source": source, **(metadata or {})}
        if ids is None:
            ids = [f"{source}:{uuid.uuid4().hex}" for _ in chunks]
        metadatas = [
            {**base_meta, "chunk_index": i, **(per_chunk_meta[i] if per_chunk_meta else {})}
            for i in range(len(chunks))
        ]

        collection.add(ids=ids, documents=chunks, embeddings=vectors, metadatas=metadatas)
        return len(chunks)

    def get_by_ids(self, ids: list[str]) -> dict[str, dict[str, Any]]:
        """Fetch chunk text + metadata by id — how a graph node becomes text again."""
        if not ids:
            return {}
        collection = self._ensure_collection()
        res = collection.get(ids=ids, include=["documents", "metadatas"])
        out: dict[str, dict[str, Any]] = {}
        for cid, doc, meta in zip(res.get("ids", []), res.get("documents", []),
                                  res.get("metadatas", [])):
            out[cid] = {"text": doc, "metadata": meta or {}}
        return out

    def query(self, question: str, top_k: int) -> list[dict[str, Any]]:
        collection = self._ensure_collection()
        if collection.count() == 0:
            return []

        embedder = get_embedder()
        q_vec = embedder.embed_query(question)
        res = collection.query(
            query_embeddings=[q_vec],
            n_results=min(top_k, collection.count()),
            include=["documents", "metadatas", "distances"],
        )

        ids = res.get("ids", [[]])[0]
        docs = res.get("documents", [[]])[0]
        metas = res.get("metadatas", [[]])[0]
        dists = res.get("distances", [[]])[0]

        hits: list[dict[str, Any]] = []
        for cid, doc, meta, dist in zip(ids, docs, metas, dists):
            meta = meta or {}
            hits.append(
                {
                    "id": cid,
                    "text": doc,
                    "source": meta.get("source", "unknown"),
                    "score": 1.0 - float(dist),  # cosine distance -> similarity
                    "metadata": meta,
                }
            )
        return hits

    def count(self) -> int:
        return self._ensure_collection().count()

    def delete_by_source(self, source: str) -> int:
        collection = self._ensure_collection()
        existing = collection.get(where={"source": source})
        ids = existing.get("ids", [])
        if ids:
            collection.delete(ids=ids)
        return len(ids)

    def reset(self) -> int:
        collection = self._ensure_collection()
        n = collection.count()
        # Recreate the collection to clear it.
        self._client.delete_collection(self._settings.collection_name)
        self._collection = self._client.get_or_create_collection(
            name=self._settings.collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        return n


_store: VectorStore | None = None


def get_store() -> VectorStore:
    global _store
    if _store is None:
        _store = VectorStore()
    return _store
