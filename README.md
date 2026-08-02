# MedCode RAG

A small, fully-local **Retrieval-Augmented Generation** API built with FastAPI.

| Piece | Choice |
|-------|--------|
| Web framework | FastAPI + Uvicorn |
| Embeddings | `BAAI/bge-m3` (multilingual, 1024-dim) via `sentence-transformers` |
| Vector store | Chroma (persistent, on-disk) |
| Generation | `Qwen/Qwen2.5-0.5B-Instruct` (tiny local LLM) via `transformers` |

Everything runs **offline on CPU**. Models are downloaded from Hugging Face on
first use (~3 GB total) and cached; the API process itself starts instantly
because models load lazily on the first request that needs them.

---

## Project layout

```
RAG/
├── app/
│   ├── main.py            # FastAPI app + router wiring
│   ├── config.py          # settings (env / .env)
│   ├── models/schemas.py  # pydantic request/response models
│   ├── core/
│   │   ├── chunking.py     # recursive character splitter
│   │   ├── embeddings.py   # bge-m3 wrapper (lazy)
│   │   ├── vectorstore.py  # Chroma wrapper
│   │   ├── llm.py          # Qwen wrapper (lazy)
│   │   └── rag.py          # ingest + retrieve + generate orchestration
│   └── routers/
│       ├── health.py       # GET /health
│       ├── documents.py    # POST /documents/text, /documents/upload, DELETE
│       └── chat.py         # POST /chat
├── scripts/ingest.py       # CLI bulk ingestion
├── data/                   # chroma db, uploads, sample corpus (gitignored)
├── tests/                  # chunker unit tests + API smoke tests
├── run.py                  # python run.py -> starts uvicorn
└── requirements.txt
```

## Setup

```bash
# from the RAG/ folder
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# then:
pip install -r requirements.txt
```

(Optional) copy the env file and tweak settings:

```bash
cp .env.example .env
```

## Run the API

```bash
python run.py
# or:
uvicorn app.main:app --reload
```

Open the interactive docs at **http://localhost:8000/docs**.

## Ingest documents

**Via CLI** (recommended for bulk / the included sample corpus):

```bash
python -m scripts.ingest data/corpus/
```

**Via API** (raw text):

```bash
curl -X POST http://localhost:8000/documents/text \
  -H "Content-Type: application/json" \
  -d '{"text":"E11.9 is Type 2 diabetes without complications.","source":"notes"}'
```

**Via API** (file upload — `.pdf`, `.csv`, `.txt`, `.md`):

```bash
curl -X POST http://localhost:8000/documents/upload \
  -F "file=@data/corpus/sample_icd10.md"
```

## Ask a question

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"What ICD-10 code is used for Type 2 diabetes with hyperglycemia?"}'
```

Response shape:

```json
{
  "question": "...",
  "answer": "...",
  "contexts": [
    {"text": "...", "source": "sample_icd10.md", "score": 0.71, "metadata": {...}}
  ]
}
```

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/health` | status + indexed document count |
| POST | `/documents/text` | index a raw text string |
| POST | `/documents/upload` | index an uploaded pdf/csv/txt/md file (CSV rows become "Header: value" lines) |
| PATCH | `/documents/{source}` | rename the display filename (index untouched) |
| DELETE | `/documents/{source}` | remove all chunks from one source |
| POST | `/chat` | ask a question (RAG) |

## Tests

```bash
pytest -q            # chunker unit tests + API smoke tests (no model download)
```

## Configuration knobs (`.env`)

`EMBED_MODEL`, `LLM_MODEL`, `TOP_K`, `CHUNK_SIZE`, `CHUNK_OVERLAP`,
`MAX_NEW_TOKENS`, `TEMPERATURE`, `EMBED_DEVICE`/`LLM_DEVICE` (`cpu`/`cuda`).

## Notes & next steps
- First `/chat` or ingest call downloads bge-m3 (~2 GB) and Qwen2.5-0.5B (~1 GB).
- For a GPU, set `EMBED_DEVICE=cuda` / `LLM_DEVICE=cuda` and install a CUDA torch build.
- To swap in a different tiny model, just change `LLM_MODEL` (any HF chat model
  with a chat template works, e.g. `Qwen/Qwen2.5-1.5B-Instruct`).
- Consider adding a reranker (bge-reranker) and hybrid (BM25 + dense) retrieval
  for higher-precision medical coding lookups.
```
