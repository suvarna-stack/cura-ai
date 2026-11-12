"""Application settings, loaded from environment / .env file."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root = the folder that contains this `app` package.
ROOT_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- App ---
    app_name: str = "MedCode RAG"
    app_version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 8000

    # --- Paths ---
    data_dir: Path = ROOT_DIR / "data"
    chroma_dir: Path = ROOT_DIR / "data" / "chroma"
    upload_dir: Path = ROOT_DIR / "data" / "uploads"
    graph_dir: Path = ROOT_DIR / "data" / "graph"
    registry_path: Path = ROOT_DIR / "data" / "documents.json"

    # --- Embeddings (retrieval) ---
    embed_model: str = "BAAI/bge-m3"          # multilingual dense embeddings
    embed_device: str = "cpu"                  # "cpu" | "cuda"
    collection_name: str = "medcode"

    # --- Chunking ---
    chunk_size: int = 800                      # characters
    chunk_overlap: int = 120

    # --- Retrieval ---
    top_k: int = 4                             # chunks fed to the LLM (plain mode)
    retrieval_mode: str = "graph"              # "graph" | "plain" default for /chat

    # --- Graph retrieval (seed with vectors, expand along edges) ---
    seed_k: int = 3                            # entry-point chunks from vector search
    graph_budget: int = 6                      # total chunks after expansion
    hop_decay: float = 0.55                    # neighbour score = seed score * decay
    max_hub_degree: int = 40                   # ignore entities linked to more chunks
    max_per_entity: int = 3                    # max chunks pulled through one entity

    # --- Ingestion ---
    min_pdf_chars: int = 200                   # below this a PDF counts as scanned
    ingest_batch_size: int = 32                # chunks embedded per progress tick

    # --- Generation (local LLM) ---
    # Backend: "transformers" (in-process, llm_model/llm_device/llm_dtype
    # below) or "ollama" (external server — GPU-offloaded GGUF, much faster;
    # ollama_base/ollama_model below).
    llm_backend: str = "transformers"
    ollama_base: str = "http://localhost:11434"
    ollama_model: str = "hf.co/mradermacher/Llama-3.1-EIRAI-8B-i1-GGUF:Q4_K_M"
    llm_model: str = "Qwen/Qwen2.5-0.5B-Instruct"
    llm_device: str = "cpu"
    # Weight dtype: "float32" | "bfloat16" | "float16" | "auto" ("auto" uses
    # the checkpoint's native dtype). bfloat16 halves RAM and is faster on
    # modern CPUs — required to fit a 3B model on a 16GB machine.
    llm_dtype: str = "float32"
    max_new_tokens: int = 512
    temperature: float = 0.3
    repetition_penalty: float = 1.1            # small models echo without it
    chat_history_turns: int = 8                # prior turns kept per /chat call

    # --- Code suggestions (/suggest) ---
    # "codebook": read the chart, look each diagnosis / procedure up in the
    # one-entry-per-code index (data/codebook). "rag": the pre-2026-11 PDF
    # chunk scraping only (kept to compare against).
    suggest_engine: str = "codebook"
    # Use the old PDF scraping for a column the chart gave no term for.
    suggest_rag_fallback: bool = True
    # Local LLM steps: "auto" = on when llm_backend is "ollama", "on", "off".
    suggest_llm_extract: str = "auto"
    suggest_llm_rerank: str = "auto"
    suggest_min_score: float = 0.3       # codebook match needed to show a code
    suggest_per_term: int = 3            # codes shown per diagnosis / procedure
    suggest_case_min_score: float = 0.35 # how alike a past case must read

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_dir.mkdir(parents=True, exist_ok=True)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.graph_dir.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_dirs()
    return settings
