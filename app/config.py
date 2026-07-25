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

    # --- Embeddings (retrieval) ---
    embed_model: str = "BAAI/bge-m3"          # multilingual dense embeddings
    embed_device: str = "cpu"                  # "cpu" | "cuda"
    collection_name: str = "medcode"

    # --- Chunking ---
    chunk_size: int = 800                      # characters
    chunk_overlap: int = 120

    # --- Retrieval ---
    top_k: int = 4                             # chunks fed to the LLM

    # --- Generation (tiny local LLM) ---
    llm_model: str = "Qwen/Qwen2.5-0.5B-Instruct"
    llm_device: str = "cpu"
    max_new_tokens: int = 512
    temperature: float = 0.3

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_dir.mkdir(parents=True, exist_ok=True)
        self.upload_dir.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_dirs()
    return settings
