# grag-ouz

The **Graph RAG** companion to [`rag-ouz`](../rag-ouz). Same document, same models, same
machine — but instead of treating the manual as a bag of unrelated chunks, it builds a
**knowledge graph** out of the document's own structure and retrieves by walking that
graph.

Everything is in **[`grag_ouz.ipynb`](grag_ouz.ipynb)** — 39 cells, commented so you can
follow the reasoning, not just run it.

## Run it

```bash
jupyter lab grag_ouz.ipynb
```

Run the cells top to bottom. A full pass takes about 7 minutes, most of it embedding
322 chunks on the CPU.

## The idea in one line

**Find an entry point with vectors, then expand along edges.**

```
                    ┌─ vector search ─┐
   question ───────►│  3 seed chunks  │
                    └────────┬────────┘
                             ▼
                 ┌───────────────────────────┐
                 │  WALK THE GRAPH           │
                 │   • same section?         │
                 │   • same ICD code?        │
                 │   • cites the same rule?  │
                 │   • adjacent in the text? │
                 └────────┬──────────────────┘
                          ▼
                 prompt ──► LLM ──► answer
```

Plain RAG asks *"what looks like the question?"*. Graph RAG asks that first, then
*"what is connected to what looks like the question?"*

## The graph

Built from structure the ICD-10 manual already has — no LLM extraction, under one second:

| | Count |
|---|---|
| Nodes | 948 (322 chunks, 570 codes, 41 sections, 15 chapters) |
| Edges | 1,911 |

| Edge | From → To | Source |
|------|-----------|--------|
| `HAS_SUBSECTION` | section → section | numbering (`4.2` ⊃ `4.2.3`) |
| `CONTAINS` | section → chunk | heading positions |
| `NEXT` | chunk → chunk | reading order |
| `MENTIONS_CODE` | chunk → code | regex for `B20.7`, `E10` |
| `REFERENCES` | chunk → section | *"see Section 4.2.3"* |

## What it actually demonstrates

Honest summary, because the notebook is a teaching tool and this is the lesson:

**On easy lookups, Graph RAG makes no difference.** Ask *"what is the purpose of the
ICD?"* and both strategies return the same passage and the same answer. Expansion is not
free, and knowing when it does not help matters.

**Where it clearly wins is the pure structural query.** `cited_by("4.2.3")` returns the
8 places in the manual that cite that section, spanning five different sections — one of
which reads *"according to Section 4.2.3"*. Vector search, given the same question in
words, returns unrelated passages at 0.49 similarity. That is not a worse ranking; it is
a question plain RAG **cannot express at all**.

Every retrieved chunk carries a `via` field explaining why the graph included it, so you
can always see the reasoning.

## Three rules that keep expansion under control

Without these, a graph walk degenerates into "return everything" — slower than plain RAG
and worse. This is the classic Graph RAG failure.

| Rule | Setting | Why |
|------|---------|-----|
| Hub suppression | `MAX_HUB_DEGREE = 40` | A code in 60 chunks is a stopword, not a link |
| Per-entity cap | `MAX_PER_ENTITY = 3` | One popular code cannot crowd out every other path |
| Rarest entity first | — | A code in 3 chunks says more than one in 30 (same idea as IDF), and sorting makes the walk deterministic |

## Tuning

| Setting | Default | Meaning |
|---------|---------|---------|
| `MAX_PAGES` | `100` | **Do not lower this much.** At 60 pages barely any codes repeat and the graph comes out almost edgeless |
| `SEED_K` | `3` | Entry-point chunks from vector search |
| `GRAPH_BUDGET` | `6` | Total chunks sent to the LLM after expansion |
| `HOP_DECAY` | `0.55` | A neighbour scores 55% of the seed that reached it |
| `TOP_K` | `4` | Chunks for the plain-RAG baseline |

Set `GRAPH_BUDGET = SEED_K` to switch expansion off — that is your control experiment.

## Source document

`data/pdfs/S0053.pdf` — WHO *ICD-10 Volume 2, Instruction Manual*, 5th ed. 2016.
252 pages; the notebook indexes the first 100, which is where the mortality coding rules
and their cross-references live.

Both models come from your local HuggingFace cache and the notebook sets
`HF_HUB_OFFLINE=1`, so no internet or API key is needed.

## Optional: LLM triple extraction

Step 10 shows the *other* way to build a graph — having an LLM read every chunk and emit
`(subject, relation, object)` triples, as Microsoft's GraphRAG does. It is **off by
default** and capped at 3 chunks, because with Qwen2.5-0.5B on a CPU it is roughly 20
seconds per chunk (90+ minutes for the full set) and about half the output is unusable.
Turn it on to feel *why* mining existing structure is preferable when the structure
exists. On a 7B+ model the trade-off flips.

## Compared with `rag-ouz`

| | `rag-ouz` | `grag-ouz` (this) |
|---|---|---|
| Retrieval | top-k cosine similarity | seed by vector, expand by edges |
| Structure used | none | sections, codes, citations, reading order |
| Build time | seconds | seconds (structural) or hours (LLM) |
| Best at | direct lookup | citations, coverage, explainability |

The FastAPI service in `../app/` implements the `rag-ouz` approach. To port this one you
would add a graph build alongside `core/vectorstore.py` and extend `core/rag.py` —
`graph_search()` is the function to move.

## Layout

```
grag-ouz/
├── grag_ouz.ipynb       the notebook — start here
├── README.md
├── requirements.txt
└── data/
    ├── pdfs/            S0053.pdf
    ├── chroma/          vector store (created on first run)
    └── graph/           for exported .gexf graphs
```
