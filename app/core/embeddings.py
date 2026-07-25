"""BAAI/bge-m3 multilingual embeddings, lazily loaded."""
from __future__ import annotations

import logging
import threading

from app.config import get_settings

logger = logging.getLogger(__name__)


class Embedder:
    """Thin, thread-safe, lazily-initialised wrapper around SentenceTransformer.

    The heavy model (~2GB) is only downloaded/loaded on first `.embed()` call,
    so the API process starts instantly.
    """

    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()
        self._settings = get_settings()

    def _ensure_model(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from sentence_transformers import SentenceTransformer

                    logger.info("Loading embedding model %s ...", self._settings.embed_model)
                    self._model = SentenceTransformer(
                        self._settings.embed_model,
                        device=self._settings.embed_device,
                    )
                    logger.info("Embedding model ready.")
        return self._model

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        model = self._ensure_model()
        vectors = model.encode(
            texts,
            normalize_embeddings=True,   # cosine similarity via dot product
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return vectors.tolist()

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]


_embedder: Embedder | None = None


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder()
    return _embedder
