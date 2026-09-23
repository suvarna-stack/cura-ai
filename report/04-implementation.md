# Chapter 4 — Implementation

*Status: draft skeleton. Word count ~3,100 (≈6.5 pages). RAG pipeline details
are pulled directly from `RAG/app/core/rag.py`, `chunking.py` and `config.py`
— quoted code is exact, not paraphrased, so it can be checked against the
live source.*

## 4.1 End to end: how one case moves through the system

1. **Sync** — `medcode-api`'s `SyncService` calls the hospital's read
   contract (locally, `imed-mock-api`'s implementation of read endpoints
   R1–R6). Because the hospital's own API has no "download everything"
   endpoint, a windowed sync chunks into ≤31-day periods (R3), and an
   unwindowed sync walks the full id list from R1 in ≤20-id batches through
   R2 — limits the hospital's contract itself enforces
   (`medcode-api/docs/api-contract.md`, `POST /api/sync`; confirmed live in
   `imed-mock-api`'s `422 too_many_visit_ids` / `422 period_too_long`
   responses, `medcode-api/CLAUDE.md`, "New iMed read contract" milestone).
   Every run is preceded by an **R6 contract check** — a fixed list of
   fields this backend actually depends on — which fails the whole sync
   with a `500` naming any field the hospital has stopped serving, *before*
   anything is written locally. New visits are imported; already-open
   visits get their hospital-sourced fields refreshed while any coder work
   is left untouched; already-finalized (approved) visits are skipped
   entirely, so a sync can never silently overwrite a coder's approved work.
2. **AI suggestion** — `POST /api/cases/{id}/suggest-codes` builds a
   clinical narrative (chief complaint and present illness first, capped at
   3,500 characters) and calls the RAG service's `/suggest` endpoint. The
   response never touches the database — see §4.3.
3. **Coder review and save** — the coder ticks/edits/adds codes in the UI;
   `PUT /api/cases/{id}/codes` persists this as a bare JSON array, stored
   and echoed **verbatim**, so new fields (like `origin` or `note`) can be
   added by the frontend without a backend contract change
   (`medcode-api/docs/api-contract.md`).
4. **Approve — a two-phase, diffed write** — `POST /api/cases/approve`:
   - Phase 1: this system's own database transaction commits first — the
     coder's saved edits become real `coder_assigned` code rows, the case
     is marked finalized.
   - Phase 2 (still inside the single write-lock): the finalized code set
     is **diffed** against the hospital's own live rows. Removed codes are
     cancelled (`DELETE`), changed codes are edited in place (`PUT`, by the
     hospital's own row id), and new codes are created (`POST`) — in that
     order (cancel → update → create) specifically so a code being created
     can never collide with a row still queued for cancellation
     (`medcode-api/docs/imed-integration.md`, decisions 1–2;
     `imed-writeback-as-built.md`, §4).
   - Every touched hospital row is journaled with its before-image in
     `imed_write_ops`. If the hospital call fails after the local commit,
     the request 500s with the local side already committed — **the fix is
     to approve again**, because the diff recomputes against live state
     rather than replaying the failed request
     (`medcode-api/docs/api-contract.md`, `POST /api/cases/approve`).
   - The hospital visit's own row also gains a `coding_status` marker
     (`approved`/cleared) via an optional field the team proposed and added
     to the hospital's existing write envelope — deliberately **not**
     written into the doctor's own `dischargestatus` field, which an
     earlier version of this feature had mistakenly overwritten
     (`medcode-api/docs/imed-integration.md`, "Coding status" section).
5. **Reopen** replays the `imed_write_ops` journal **in reverse** — a
   created row is cancelled, an updated row is restored to its pre-approve
   values, a cancelled row is re-created (with a **new** hospital-side id,
   since iMed has no "un-cancel" — a documented, real limitation,
   `imed-writeback-as-built.md`, §5.7) — and clears the coding-status
   marker. The coder's saved edits are kept, so re-approving does not lose
   work.

## 4.2 The AI part: the RAG pipeline in detail

### 4.2.1 Ingestion — chunking and indexing

Reference material (the hospital's ICD-10 and ICD-9 manuals as PDFs, plus a
Thai ICD-10-TM primary-care reference, `RAG/data/documents.json`) is chunked
with a small, dependency-free recursive character splitter
(`RAG/app/core/chunking.py`): it tries to break on paragraph boundaries
first, then sentence, then word, then hard character count, greedily merges
small fragments up to a target size, and adds a trailing overlap from the
previous chunk to each new one so context is not lost at a chunk boundary.
Defaults: **800-character chunks, 120-character overlap**
(`RAG/app/config.py`), both configurable via environment variables. Each
chunk is given a deterministic id (`"{source}:p{page}-c{i}"`) that is shared
between the vector store and a parallel knowledge graph — the same identity
is what lets graph-based retrieval (below) expand from a vector hit to its
neighbors (`RAG/app/core/rag.py`, `ingest_pages`).

### 4.2.2 Embeddings and vector store

Chunks are embedded with **`BAAI/bge-m3`** (a multilingual, 1024-dimension
sentence-transformer model), chosen specifically because it supports Thai
and English in the same embedding space — a coder can ask a question in
Thai and retrieve English-language reference PDF passages, or vice versa,
without a translation step (`RAG/README.md`: *"embeddings are multilingual
so Thai retrieval works against English documents"*, also stated in
`medcode-api/docs/api-contract.md` for the Agent chat endpoint). Vectors are
stored in **Chroma**, a persistent on-disk vector database
(`RAG/app/core/vectorstore.py`), so the index survives service restarts
without re-embedding every document.

### 4.2.3 Retrieval — two modes, plus exact-match and coder-taught layers

`RAG/app/core/rag.py` implements two retrieval strategies, selectable per
request:

- **`plain`** — classic top-k cosine similarity search against the vector
  store.
- **`graph`** — vector search finds a small number of *seed* chunks
  (`seed_k`, default 3), then a knowledge graph expands one hop outward
  along shared codes, document sections, citations, and reading order,
  scoring neighbors at `seed_score × hop_decay` (default decay 0.55), up to
  a fixed `graph_budget` (default 6 chunks) — this is meant to surface
  clinically related passages a pure similarity search might rank just
  below the cutoff (e.g., two codes that always co-occur in the manual's
  own cross-references).

On top of whichever mode is active, two extra retrieval channels are always
applied, and are specifically what keeps this a *dictionary-grounded*
lookup tool rather than a free-form chat model:

- **Exact code lookup.** If the question names an ICD-shaped token (a regex
  match for ICD-10's `letter + 2 digits [+ decimals]` or ICD-9's
  `digits.digits` pattern), the literal chunk(s) containing that code are
  fetched via a substring match and placed **ahead of** the semantic hits —
  because, in the code's own words, *"'what is I33' is a lookup, not a
  semantic question — embeddings are weak at short code strings"*
  (`RAG/app/core/rag.py`, `_code_hits`).
- **Coder-taught rules ("Suggest & Learn").** A coder can teach a rule in
  plain language ("Diabetic patient with acute kidney injury: code E11.22
  as principal, add N17.9, do not code N18.9") through a two-step
  extract-then-confirm flow (`/learn/extract` produces a draft **that stores
  nothing**; the coder must separately confirm it via `/learn/notes` before
  it is embedded and indexed). Once stored, a matching rule is pinned
  **above** both the semantic hits and the exact code lookups for any future
  question or suggestion matching its scenario, cited as `"Coder note —
  {author}"`, and any code the rule marked `exclude` is actively removed
  from the AI's suggestions even if a reference PDF would otherwise have
  offered it (`RAG/README.md`, "Suggest & Learn"; `medcode-api/docs/
  api-contract.md`, `/api/agent/learn/**`). Crucially, **nothing is
  fine-tuned** — this is a retrieval-time layer, so every rule stays listed,
  attributed to its author, editable only by its author (or an admin), and
  deletable — the audit trail a hospital needs for anything influencing a
  code suggestion.

Results across all channels are capped at 8 chunks total (`_MAX_CONTEXT_CHUNKS`)
to keep the prompt small enough for CPU-budget latency, and are re-ordered so
pinned (exact-match / coder-taught) chunks appear first in the context the
model actually reads.

### 4.2.4 Generation — the prompt and the model

The system prompt sent with every request (`RAG/app/core/rag.py`,
`SYSTEM_PROMPT`), quoted in full because its exact wording is the grounding
mechanism:

> *"You are MedCode, a careful assistant for medical-coding questions.
> Answer ONLY using the provided context. If the context does not contain
> the answer, say you don't know. A context block marked CODER RULE was
> taught by this hospital's own coder: it overrides the general references,
> so follow it and say that it is a coder rule. Be concise — at most about
> 120 words — and cite the source name(s) and page(s) in square brackets.
> Always answer in the same language the question was asked in — English
> questions get English answers, Thai questions get Thai answers..."*

The retrieved chunks are assembled into a numbered context block (each
tagged with its source document name and page number) and appended to the
user's question, with an explicit same-language instruction repeated
adjacent to the question itself — the code comment explains why: *"Small
models follow the context's language over a distant system line — an
explicit instruction adjacent to the question is what actually works"*
(`RAG/app/core/rag.py`, `_prepare`). This is a concrete, documented
adaptation made **because** the default local model is small — see below.

Generation itself is pluggable between two backends
(`RAG/app/config.py`, `RAG/README.md`):

- **`transformers` (default)** — **`Qwen/Qwen2.5-0.5B-Instruct`** running
  in-process on CPU. Tiny (≈1 GB), works with zero extra infrastructure, but
  is explicitly documented as "much weaker output" than the alternative
  (`medcode-stack/README.md`).
- **`ollama`** — a larger model (the compose stack defaults to an 8B
  Llama-3.1-based model, `hf.co/mradermacher/Llama-3.1-EIRAI-8B-i1-GGUF:Q4_K_M`)
  served by a host-native Ollama process, because Docker on macOS has no GPU
  passthrough and an in-container 8B model would be far slower
  (`medcode-stack/README.md`, "AI (the RAG service)"). The team's own
  deployment notes also flag a Thai-tuned alternative worth evaluating
  before a real launch — SCB 10X's **Typhoon 2** family, built on Gemma 3 /
  Qwen 3 — as a one-setting swap, not a rebuild
  (`medcode-api/docs/DEPLOYMENT-PREP.md`, closing note).

### 4.2.5 The grounding guard: `unverified_codes`

After generation, every ICD-shaped token in the model's own answer is
compared against every ICD-shaped token present in the retrieved context.
Any code the model mentions that **no retrieved chunk actually contains** is
collected into an `unverified_codes` list and returned to the caller as a
warning, never presented as fact (`RAG/app/core/rag.py`, `_verify_codes`;
surfaced to the coder UI per `medcode-api/docs/api-contract.md`,
`/api/agent/chat`). This is the concrete implementation of the "AI cannot
make up a code" safety claim in the team's own pitch material (Chapter 1,
§1.4) — it is not a claim the model is asked to police itself; it is a
separate, deterministic check.

## 4.3 Safeguards — how "human always approves" is actually enforced

The safety properties this system claims are not aspirational — each one
maps to a specific, checkable mechanism in the code:

- **AI suggestions write nothing.** `POST /api/cases/{id}/suggest-codes` is
  explicitly documented as writing to neither `case_codes` nor the coder
  history (`medcode-api/docs/api-contract.md`) — the *only* path that
  persists a code is the coder's own `PUT /codes` save, and the *only* path
  that reaches the hospital is `POST /approve`, a separate, explicit,
  authenticated action.
- **Nothing is pre-selected by AI.** Since the 2026-08-07 "selection-first"
  change, an AI-suggested code is not ticked by default — a coder must
  actively select it before it can be approved (§3.1.2).
- **The AI is switchable off without breaking the app.** RAG is optional by
  construction (Chapter 3, §3.2) — this is a safeguard as much as an
  architectural choice, because it means a hospital is never in a position
  where the AI must be trusted to keep the coding workflow running at all.
- **Grounding, not invention.** The `unverified_codes` check (§4.2.5) and
  the "answer only from context" system prompt (§4.2.4) are the mechanism
  that prevents the model from hallucinating a plausible-looking but
  nonexistent code.
- **Human authorship is preserved in Suggest & Learn.** A taught rule can
  only be edited, muted, or deleted by the coder who taught it (or an
  admin) — even an administrator cannot silently rewrite another coder's
  clinical judgment call (`medcode-api/CLAUDE.md`, "Learned rules belong to
  the coder who taught them"), which matters because a rule directly steers
  future AI suggestions.
- **Every write is journaled and reversible.** The `imed_write_ops` table
  (§4.1) means an approval is not a one-way door — a coder can reopen a
  case and the hospital's own data is restored, not just this system's
  local copy.
- **Every coder action is attributed.** Approvals and reopens stamp the
  authenticated account's email as the acting coder (never a client-supplied
  name), and `coding_history` keeps an oldest-first audit trail per case
  (`medcode-api/docs/api-contract.md`, "Authentication" / "Actor stamping").
- **One coder at a time per case.** A 90-second renewable lock prevents two
  coders from editing/approving/reopening the same case simultaneously —
  though it deliberately does *not* block the shared "star" flag, since
  flagging a case for attention is not an edit
  (`medcode-api/docs/api-contract.md`, `POST /api/cases/{id}/lock`).
- **Deterministic, disposable demo data.** The demo dataset is generated by
  a seeded-RNG script and is fully reversible via a snapshot/reset pair
  (`POST /api/demo/snapshot` / `POST /api/demo/reset`) — both gated off by
  default outside local development (`DEMO_TOOLS_ENABLED`), because they
  are destructive bulk writes (`medcode-api/docs/api-contract.md`). See
  Chapter 5 for the full data-provenance discussion.

**[TODO]**: none of the above safeguards have been evaluated against
adversarial or edge-case inputs (e.g., a coder trying to approve an
all-unselected code list, or a chart with no diagnosis-relevant text at all)
beyond what the existing automated test suite covers — the 46/46
`CasesApiIntegrationTest` result recorded in `eval-results/medcode-api-test-output.txt`
is the current evidence base; a dedicated security/robustness review is not
part of this deliverable and belongs with Chapter 8's deployment gap list.
