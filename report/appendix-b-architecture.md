# Appendix B — Architecture & data-flow diagrams

Full interactive diagrams (12 sections covering the system boundary, the
case coding pipeline, sync/approve/reopen, auth, the RAG seam, and a full
process-by-table CRUD matrix) live at `medcode-api/docs/dataflow.html` —
open it in a browser for the interactive version; two of its figures are
captured statically below for this appendix.

## Figure B.1 — System boundary (Level 0 context)

![System boundary diagram — Medical coder and Administrator browsers on
top, MedCode AI backend in the center, Hospital iMed API and MedCode RAG
service below](../../audit-chart-frontend/docs/screenshots/dataflow-diagram-context.png)

Four actors: the coder's browser, the admin console, the hospital's iMed
API (read/write, one direction is irreversible — diagnosis POST/PUT/DELETE),
and the RAG service (clinical text in, code candidates out). MedCode AI's
backend is the only component with write access to its own database and the
only one that owns the API contract.

## Figure B.2 — The case coding pipeline

![Case coding pipeline diagram](../../audit-chart-frontend/docs/screenshots/dataflow-diagram-pipeline.png)

*(See `dataflow.html` for the remaining 10 sections: processes-and-stores
index, sync, approve two-phase/one-lock, reopen-as-journal-replay,
authentication, the RAG seam's four flows, the single-writer/single-cache
model, and the full process × table matrix — not reproduced here to avoid
duplicating an already-maintained, versioned document.)*

## Deployment topology — what runs where

One `docker compose` file runs all five services (`medcode-stack/`
orchestrates; each service builds its own image from its own repo):

| Service | Host port | Inside the network |
|---|---|---|
| `web` (nginx + SPA) | `localhost:8080` | `web:8080` |
| `medcode-api` | `localhost:8001` | `medcode-api:8001` |
| `imed-mock-api` | `localhost:8003` | `imed-mock-api:8003` |
| `rag` | `localhost:8000` | `rag:8000` |
| `db` (Postgres 18) | `localhost:5433` | `db:5432` |

The browser only ever talks to port 8080; every other service is reached
through it. Ports are overridable in `.env`; two (8080, 5433) are
intentionally offset from the native four-terminal dev setup so both can run
side by side. Full detail: `medcode-stack/README.md`.
