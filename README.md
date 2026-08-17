# medcode-stack — the whole MedCode AI system in containers

One `docker compose` file that runs all four repos plus Postgres. It contains no
application code: each repo builds its own image from its own `Dockerfile`, and
this folder owns only what lives *between* them — startup order, the env vars
that point the services at each other, the shared database, and the volumes.

## Layout it expects

```
development/
  medcode-api/            backend        → image built from its own Dockerfile
  imed-mock-api/          fake hospital  → same
  audit-chart-frontend/   web UI         → same (nginx + built SPA)
  RAG/                    AI service     → same
  medcode-stack/          ← you are here (compose only)
```

The compose file uses `../<repo>` as build contexts, so all five folders must be
siblings. Nothing is copied between repos.

## Prerequisites

- Docker (Docker Desktop, Colima, OrbStack — any Docker Engine 20.10+), given
  **at least 4GB of RAM** in its settings
- Ollama running on the **host**, if you want AI generation (see below)
- No native Postgres on port 5433 and nothing on 8080/8001/8003/8000

Nothing else: no Java, Node, Python or PostgreSQL install is needed — every
build happens inside the images. Windows and Linux work the same as macOS (on
Windows use Docker Desktop with the WSL2 backend, and run the commands from
PowerShell or a WSL shell).

## Run it

```bash
cp .env.example .env      # edit ports/passwords if you like
docker compose up -d --build
```

Then open **http://localhost:8080** and log in with the bootstrap admin from
`.env` (`admin@medcodeai.demo` / `admin1234` by default).

First run takes a while: two Maven builds, an npm build, and a PyTorch install.
Later runs are cached.

```bash
docker compose ps                 # health of all five services
docker compose logs -f medcode-api
docker compose down               # stop, keep data
docker compose down -v            # stop and WIPE the databases + RAG index
```

## What runs where

| Service | Host port | Inside the network |
|---|---|---|
`web` (nginx + SPA) | http://localhost:8080 | `web:8080` |
`medcode-api` | http://localhost:8001 | `medcode-api:8001` |
`imed-mock-api` | http://localhost:8003 | `imed-mock-api:8003` |
`rag` | http://localhost:8000 | `rag:8000` |
`db` (Postgres 18) | `localhost:5433` | `db:5432` |

Two host ports differ from the native four-terminal setup on purpose, so this
stack can run **alongside** it: the web UI is on **8080** (5173 belongs to the
vite dev server) and Postgres on **5433** (5432 belongs to Homebrew Postgres).
All ports are overridable in `.env`.

### The browser only ever talks to port 8080

The SPA is built with `VITE_API_BASE_URL=/api`, and nginx proxies `/api` to
`medcode-api`. That means one origin, so **no CORS**, and the same image works in
every environment — nothing about the backend's address is baked into the bundle.
Port 8001 is still published for Swagger and `curl`, but the app doesn't use it.

## The database

One Postgres server holds **both** databases — `medcode` (ours) and `imed` (the
hospital's) — matching the GCP deploy plan. Both are restored from the committed
dumps in the two repos by the scripts in `db/initdb/`.

Those scripts run **only once**, when the `pgdata` volume is empty. To re-seed:

```bash
docker compose down -v && docker compose up -d
```

Not in the dumps, and restored a different way: `medcode-api`'s `SchemaBootstrap`
re-applies the auth columns, the bootstrap admin and the `icd_10`/`icd_9` catalog
split at every startup. That is by design — don't try to fix a "missing"
`password_hash` by editing a dump.

Reach it from the host with:

```bash
psql -h localhost -p 5433 -U postgres -d medcode
```

Remember the hospital database keeps its tables in a schema named `imed`, not
`public`:  `psql … -d imed -c 'select count(*) from imed.medhack_patient'`.

## AI (the RAG service)

`rag` runs retrieval in the container but sends **generation to Ollama on your
host** (`OLLAMA_BASE=http://host.docker.internal:11434`). Docker on macOS has no
GPU passthrough, so an in-container Ollama would fall back to CPU and be much
slower. Install Ollama natively and pull the model once:

```bash
ollama pull hf.co/mradermacher/Llama-3.1-EIRAI-8B-i1-GGUF:Q4_K_M
```

If `host.docker.internal` doesn't resolve on your runtime, put your machine's LAN
IP in `OLLAMA_BASE`. To drop Ollama entirely, set `LLM_BACKEND=transformers` —
in-process, CPU, and much weaker output.

RAG is **optional by design**: nothing `depends_on` it, and with it down the app
keeps working except for AI suggestions, Agent chat and Training.

Two volumes hold its state: `ragdata` (chroma index, knowledge graph, uploaded
PDFs — seeded from the repo's committed baseline on first run) and `hfcache` (the
downloaded embedding model, so it survives rebuilds).

## Memory and disk

The full stack is two JVMs, a PyTorch process, nginx and Postgres. Give Docker
**at least 4GB** of RAM, 6GB if you also run Ollama's 8B model on the same
machine — an 8GB laptop cannot comfortably do both at once. If Ollama is
squeezed, run the stack with `LLM_BACKEND=transformers`, or run RAG natively and
`docker compose up db imed-mock-api medcode-api web`.

Disk: roughly 4–5GB of images with the defaults. `PREFETCH_EMBED_MODEL=1` adds
about 3GB more but makes the RAG image self-contained and offline-capable, which
is what you want for a CI-built image or a hospital demo on a strange network.

## Running the test suites

The suites are not containerized — they run on the host against this stack:

```bash
# medcode-api needs both databases and the hospital mock reachable
cd ../medcode-api
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/medcode \
IMED_API_BASE=http://localhost:8003 ./mvnw test
```

Note that 13 `CasesApiIntegrationTest` failures are pre-existing and unrelated to
containers — the suite's hard-coded case IDs predate the current demo dataset.

## Production is not this file

Compose is for local dev, demos and onboarding. For the M7 GCP cutover, each repo
builds and pushes its **own** image and Cloud Run wires them with the same env
vars used here. Three things to carry over:

- `medcode-api` must stay at **one instance** (`max-instances=1`) — its write
  lock and cases cache are in-process.
- Build for the target architecture: these Macs are arm64, GCP is amd64
  (`docker buildx build --platform linux/amd64`).
- The image forces `SWAGGER_ENABLED=false` and `DEMO_TOOLS_ENABLED=false`; this
  compose file deliberately turns them back on. Don't carry that over.
- Replace every default password and put the real ones in Secret Manager.
