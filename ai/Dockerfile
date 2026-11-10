# RAG service — FastAPI + sentence-transformers (BAAI/bge-m3) + Chroma.
# Matches the venv this repo is developed against (README: python -m venv .venv).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    # Hugging Face cache lives in the image, so the embedding model is present
    # at first request instead of being downloaded into a fresh container.
    HF_HOME=/opt/hf

WORKDIR /app

# curl for the healthcheck; the slim image has neither curl nor wget.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# torch FIRST, from PyTorch's CPU index: the default PyPI wheel drags in the
# whole CUDA runtime (~2.5GB of dead weight for a CPU deployment). The fallback
# covers linux/arm64, where the cpu index has no wheel — plain PyPI torch is
# CPU-only there anyway. Installing it before requirements.txt means pip sees
# "torch>=2.5" already satisfied and leaves this build alone.
RUN pip install --index-url https://download.pytorch.org/whl/cpu "torch>=2.5" \
    || pip install "torch>=2.5"

COPY requirements.txt ./
RUN pip install -r requirements.txt

# Bake the embedding model (~2.3GB) into the image. Turn it off with
# --build-arg PREFETCH_EMBED_MODEL=0 for a much smaller image that downloads
# the weights on first use instead (needs network at runtime, slow first call).
ARG PREFETCH_EMBED_MODEL=1
ARG EMBED_MODEL=BAAI/bge-m3
RUN if [ "$PREFETCH_EMBED_MODEL" = "1" ]; then \
        python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('$EMBED_MODEL')"; \
    fi

COPY app app
COPY run.py ./

# The committed demo baseline: chroma index, knowledge graph, document registry
# and the uploaded source PDFs. Shipping it means a fresh named volume mounted
# at /app/data comes up already populated (Docker seeds an empty named volume
# from the image); after that the volume is the source of truth.
COPY data data

# Generation is external by default — the container talks to Ollama on the host
# (compose sets OLLAMA_BASE). Overridable per environment.
ENV LLM_BACKEND=ollama \
    EMBED_DEVICE=cpu \
    HOST=0.0.0.0 \
    PORT=8000

# /health is cheap: the embedder is lazily constructed, so this answers long
# before any model is loaded.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT:-8000}/health" || exit 1

# run.py enables uvicorn --reload, which is wrong in a container (a second
# process, and a restart mid-request when data/ changes). Serve directly, one
# worker — chroma and the in-process caches assume a single process.
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
