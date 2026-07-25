# rag-ouz

A learning project: build a complete **RAG (Retrieval-Augmented Generation)** pipeline
from scratch in a Jupyter notebook, over two real medical-coding PDFs, running entirely
offline on CPU.

Everything lives in **[`rag_ouz.ipynb`](rag_ouz.ipynb)** — 31 cells, each one commented
so you can follow what is happening and why.

## Run it

```bash
jupyter lab rag_ouz.ipynb
```

Then run the cells top to bottom. The first full pass takes about 4 minutes, most of it
embedding text on the CPU.

If Jupyter is not installed:

```bash
pip install -r requirements.txt
```

## What it builds

```
PDF ──► text ──► chunks ──► embeddings ──► vector store
                                                │
                   question ──► embedding ──────┤
                                                ▼
                                          top-k chunks ──► prompt ──► LLM ──► answer
```

| Step | What happens | Library |
|------|--------------|---------|
| 1 | Read text out of the PDFs | `pypdf` |
| 2 | Cut text into overlapping chunks | plain Python |
| 3 | Turn each chunk into a vector | `sentence-transformers` — BAAI/bge-m3 |
| 4 | Store vectors for fast search | `chromadb` |
| 5 | Find chunks closest to a question | `chromadb` |
| 6 | Answer using only those chunks | `transformers` — Qwen2.5-0.5B-Instruct |
| 7 | Understand the failure modes | — |

Both models are already in your HuggingFace cache, and the notebook sets
`HF_HUB_OFFLINE=1`, so **no internet and no API key are needed**.

## The two source documents

| File | What it is | Pages | Usable? |
|------|-----------|-------|---------|
| `data/pdfs/S0053.pdf` | WHO *ICD-10 Volume 2 — Instruction Manual*, 5th ed. 2016 | 252 | ✅ ~473,000 characters of real text |
| `data/pdfs/S0034.pdf` | *ICD-9-CM 2015* (Thai edition) | 490 | ❌ **scanned images — zero extractable text** |

S0034 is a photograph of every page (one 1896×1240 JPEG each), so `pypdf` gets nothing
out of it. The notebook detects this, explains it, and continues with S0053 alone.
A switched-off OCR cell shows how to recover it if you want to — see step 1.

This is not a flaw in the exercise. Discovering that half your corpus is unreadable is
the most realistic thing about it.

## Tuning

All knobs are in the config cell near the top:

| Setting | Default | Meaning |
|---------|---------|---------|
| `MAX_PAGES` | `60` | Pages indexed per PDF. `None` = all 252. Start at 60, it is quick. |
| `CHUNK_SIZE` | `800` | Characters per chunk |
| `CHUNK_OVERLAP` | `120` | Characters repeated between neighbouring chunks |
| `TOP_K` | `4` | Chunks pasted into the prompt |

Change a value, re-run the cells below it, and watch what happens to the answers.
The final section lists seven exercises in roughly descending order of value.

## Asking your own questions

Once the notebook has run:

```python
ask("What is the underlying cause of death?")
ask("How are dagger and asterisk codes used?", show_context=True)
```

`show_context=True` prints the exact text that was handed to the model. Reach for it
whenever an answer looks wrong — the problem is usually retrieval, not the LLM.

## Reusing the index

The vector store persists in `data/chroma/`. In a new session you can skip straight to
querying without re-embedding anything:

```python
client = chromadb.PersistentClient(path=str(CHROMA_DIR))
collection = client.get_collection(COLLECTION_NAME)
embedder = SentenceTransformer(EMBED_MODEL, device=DEVICE)
```

## Relation to the FastAPI project

The `../app/` backend is this same pipeline behind a web API:

| Notebook | FastAPI project |
|----------|-----------------|
| `chunk_text()` | `app/core/chunking.py` |
| `embedder` | `app/core/embeddings.py` |
| `collection` | `app/core/vectorstore.py` |
| `generate()` | `app/core/llm.py` |
| `ask()` | `app/core/rag.py` |

Prototype a change here where you can see every intermediate value, then port it there.

## Layout

```
rag-ouz/
├── rag_ouz.ipynb        the notebook — start here
├── README.md
├── requirements.txt
└── data/
    ├── pdfs/            S0053.pdf, S0034.pdf
    ├── chroma/          vector store (created on first run)
    └── ocr/             OCR output, if you enable it
```
