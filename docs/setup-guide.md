# Setup Guide

From a clean `git clone` to a working CURA AI. Follow it in order.

Everything runs **on your own machine**: no cloud account, no API key, and no
credentials in any repository. The only thing you install is Docker. The
optional AI chat model runs in [Ollama](https://ollama.com) on the same machine.

---

## What you need

| | Why |
|---|---|
| **Docker** + Compose (Engine 20.10+) | Every service builds and runs in a container. Docker Desktop, Colima and OrbStack all work. |
| **≥4 GB RAM given to Docker** | A JVM, a PyTorch process, nginx and Postgres. Give it **6 GB** if Ollama's 8B model also runs on the same machine. An 8 GB laptop cannot comfortably run both. |
| **~5 GB free disk** | Images with the defaults. Add ~3 GB if you bake the embedding model into the image (`PREFETCH_EMBED_MODEL=1`). |
| **Git** | To clone the repository. |
| **The hospital's iMed API** | Every case comes from it by Sync, and approved codes go back to it. The hospital builds and runs it; it is not in this repo. Without it the app starts, but has no cases. |
| **[Ollama](https://ollama.com)**, *optional* | Only for the AI Agent chat. Code suggestions do **not** need it (see [step 4](#4--ai)). |
| A modern browser | Chrome, Edge or Firefox. Nothing to install on the coder's side. |

No Java, Node, Python or PostgreSQL install is needed to *run* the system.
Those are only needed to run the test suites on the host ([step 5](#5--verify)).

Free host ports: **8080, 8001, 8000, 5433**. All four can be moved in
`.env`.

---

## 1 · Clone the repository

```bash
git clone https://github.com/phyowaiyanlinzaw/cura-ai.git
cd cura-ai
```

```
cura-ai/                  ← compose file, DB init scripts, docs (you work from here)
  frontend/               web UI             (React + Vite, served by nginx)
  backend/                backend            (Spring Boot, Java 21)
  ai/                     AI service         (FastAPI, Python)
```

The compose file builds each image from its folder, and it mounts the
database seed file straight out of `backend/db/`.

---

## 2 · Configure

```bash
cp .env.example .env
```

Set the three `IMED_*` values to the hospital's API. Everything else has a
working default. The file exists so you can change ports and secrets without
touching the compose file.

| Setting | Default | Change it when |
|---|---|---|
| `IMED_API_BASE` | blank = port 8003 on this machine | **always**: the hospital's iMed API, host only (no `/api/v1`, no trailing slash) |
| `WEB_PORT` · `API_PORT` · `RAG_PORT` · `DB_PORT` | 8080 · 8001 · 8000 · 5433 | a port is already taken |
| `ADMIN_BOOTSTRAP_EMAIL` / `_PASSWORD` | `admin@medcodeai.demo` / `admin1234` | **before anything reachable from another machine** |
| `POSTGRES_PASSWORD` | `postgres` | same |
| `IMED_CLIENT_ID` / `IMED_CLIENT_SECRET` | blank | **always**: the hospital's admin issues the pair; medcode-api trades it for a short-lived token at `/auth/token` |
| `LLM_BACKEND` · `OLLAMA_BASE` · `OLLAMA_MODEL` | `ollama` · `http://host.docker.internal:11434` · EIRAI-8B | see step 4 |

`.env` is gitignored. `.env.example` is the only tracked copy, and it holds
demo defaults only.

---

## 3 · Start the stack

```bash
docker compose up -d --build
docker compose ps          # wait until all four are up
```

The first run is slow: a Maven build, an npm build and a PyTorch install.
Later runs reuse the build cache.

| Service | Open | What it is |
|---|---|---|
| `web` | **http://localhost:8080** | The app. nginx serves the built UI and proxies `/api` to the backend |
| `medcode-api` | http://localhost:8001/swagger-ui.html | Backend. Swagger is on in this demo stack only |
| `rag` | http://localhost:8000/docs | AI service |
| `db` | `psql -h localhost -p 5433 -U postgres` | Postgres 18, holding the `medcode` database |

**The browser only ever talks to port 8080.** The UI is built with
`VITE_API_BASE_URL=/api`, so every call is same-origin and CORS never comes up.
Port 8001 is published for Swagger and `curl` only.

On first boot, Postgres creates the `medcode` database and restores it from
the committed dump. It starts **empty**: no cases and no users. Then
`medcode-api`'s Flyway migrations run and the bootstrap admin is created.

---

## 4 · AI

The AI service is **optional by design**: nothing depends on it. With it down,
coders can still sync, edit codes, approve and reopen. Only suggestions, the
Agent chat and the AI Training page stop working.

### 4a · Code suggestions: nothing to do

Suggestions are **retrieval only**, with no language model involved. The
embedding model (`BAAI/bge-m3`, ~2.3 GB) downloads into the `hfcache` volume
the first time a case asks for suggestions. **That first request takes about a
minute and looks like a hang.** After that it is cached and survives rebuilds.
The reference index (three ICD manuals, already chunked and embedded) ships
committed in `ai/data/` and is copied into the `ragdata` volume on first run.

### 4b · Agent chat: needs Ollama on the host

Generation runs in **Ollama on your machine, not in a container**. Docker on
macOS has no GPU passthrough, so an in-container model would be CPU-only and far
slower.

```bash
ollama serve &                                                   # if not already running
ollama pull hf.co/mradermacher/Llama-3.1-EIRAI-8B-i1-GGUF:Q4_K_M  # ≈5 GB, once
```

Three things that will bite you:

- **The pull can fail with `blocked redirect to a different host`.** Seen on
  2026-09-21 on every retry. Ollama's client refuses a redirect from Hugging
  Face's download CDN. We have **not** solved this yet. One untested idea:
  download the GGUF with `huggingface_hub` and import it with `ollama create`
  and a local Modelfile. Until then, the chat stays unavailable and everything
  else works.
- If `host.docker.internal` does not resolve on your Docker runtime, put your
  machine's LAN IP in `OLLAMA_BASE`.
- `LLM_BACKEND=transformers` avoids Ollama entirely. It runs a 0.5B model on
  CPU inside the container. It works, but its answers are much weaker.

---

## 5 · Verify

```bash
# 1. every service answers
curl -s localhost:8001/api/healthz     # {"ok":true,"cases":0,"db":"pg"}  (real COUNT(*))
curl -s localhost:8000/health
```

Then walk the app:

1. Open **http://localhost:8080** and sign in as `admin@medcodeai.demo` /
   `admin1234`.
2. **The admin account cannot open the coding screens.** Coding is a coder-role
   page, and an admin is redirected to the admin console. Go to **Accounts**,
   create a coder account, sign out, and sign back in as that coder.
3. The dashboard is empty. That is correct. Press **Sync** (ซิงค์), pick a
   date range, and confirm with **Sync now** (ซิงค์เลย). The hospital's visits
   for those days load. A visit that arrives with both code systems is
   *Complete*; one missing either is *Incomplete*.
4. Open a case. AI suggestions appear in the ICD-10 and ICD-9 columns (the
   first time, after the ~1 minute model download). Tick codes and **Approve**.
   The codes are written back to the hospital through its API within seconds.

### Run the test suites

These run on the host against the running stack, so they need Java 21 and
Python 3:

```bash
# medcode-api — needs the database AND a hospital iMed API reachable.
# It approves and reopens for real, so use a hospital TEST server.
cd backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/medcode \
IMED_API_BASE=https://<hospital-test-server> ./mvnw test

# RAG — no model download needed
cd ../ai && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/pytest -q
```

Results recorded for the report (`eval-results/`), run against our old mock
hospital before it was removed: medcode-api 90/91, RAG 82/82. The one
medcode-api failure is a test-isolation gap: the hospital's writes are not
rolled back between runs. It is not a product defect. The load tests (Apache Bench) and their exact commands are in
`eval-results/perf/`.

### Demo data

No patient data exists anywhere in this repository. Cases live in the
hospital and arrive through its API on Sync.

| What | Where |
|---|---|
| Hospital visits | Not in this repo. Pulled from the hospital's iMed API on Sync |
| Our empty starting database, with the ICD-10 / ICD-9 catalogs | `backend/db/seed.sql.gz`; the catalogs are refreshed from the hospital's on every sync |
| AI reference index (3 ICD manuals) | `ai/data/` (Chroma index, knowledge graph, PDFs) |
| Accounts | Only the bootstrap admin. Coders are created by the admin |

---

## Updating after `git pull`

Postgres only reads the seed dumps into an **empty** volume. So:

```bash
git pull
docker compose down -v       # the -v is what makes new demo data load
docker compose up -d --build
```

`down -v` deletes the database and the AI index, **including any approvals
made in this stack** (codes already written back stay at the hospital). Both are
rebuilt from the committed files.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Cannot connect to the Docker daemon` (Colima) | Colima's socket is not the default. Run `colima start`, then `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"`. |
| `medcode-api` keeps restarting; its log says `database "medcode" does not exist` (Colima) | The repo is outside your home folder. Colima shares only your home folder with containers by default, so `db` started with empty init scripts. Move the clone under `~`, then `docker compose down -v` and up again. |
| `port is already allocated` | Something else holds 8080/8001/8000/5433. Change that port in `.env`. |
| Sync, Approve or Reopen fails with "iMed API not reachable" | The hospital's API is down or `IMED_API_BASE` is wrong. Check `.env`, then `docker compose up -d medcode-api`. |
| … fails with "refused our client credentials" | `IMED_CLIENT_ID` / `IMED_CLIENT_SECRET` are wrong. Ask the hospital's admin for the pair. |
| … fails with "hospital contract check failed" | The hospital's API no longer serves a field our code needs (R6). The message lists the missing fields; nothing was imported. |
| … fails with "the hospital API answered 4xx/5xx on …" | The hospital refused that call. Its own error body is in `docker compose logs medcode-api`. |
| After a pull the demo data looks old | Postgres ignored the new dumps because the volume already existed. `docker compose down -v`, then up again. |
| "password_hash does not exist", or no admin can sign in | The database was restored but the app has not booted yet. Start `medcode-api`. Flyway adds the columns and the bootstrap admin at startup. Never edit a dump to fix this. |
| Admin signs in but never sees cases | Working as designed. Cases are a coder-role screen. Create a coder under **Accounts**. |
| First case shows no AI suggestions | The embedding model is still downloading (~1 minute, once). Wait for `Embedding model ready` in `docker compose logs rag`, then reopen the case. |
| AI suggestions never appear | `rag` is down or out of memory. `docker compose ps`, then give Docker more RAM (≥4 GB). Coding still works without it. |
| Agent chat errors or never answers | Ollama is not running or the model is not pulled. Check `curl localhost:11434/api/tags` on the host. See step 4b. |
| `ollama pull` fails: *blocked redirect to a different host* | Known and unsolved. See step 4b. |
| A training upload is refused | Over 50 MB (nginx limit), or a scanned PDF with no text layer (the AI service needs extractable text). |
| `medcode-api` tests fail with "iMed API not reachable" | A hospital test server must be reachable through `IMED_API_BASE`. |
| Swagger or **Reset demo** answers 404 | Both are forced off inside the images and turned back on only by this compose file (`SWAGGER_ENABLED`, `DEMO_TOOLS_ENABLED`). Check `.env`. |
| "This case is being worked on by …" | One coder per case. The lock expires 90 seconds after the other coder leaves the page. |

---

## Without Docker

`backend/RUN-ALL.md` covers the manual three-terminal setup (native
Postgres 18, Java 21, Python and Node) on macOS, Linux and Windows. It is
written in Thai.

---

## Where to go next

| Document | What |
|---|---|
| [`architecture.md`](architecture.md) | Topology, the coding flow, the AI pipeline, the data model, known gaps |
| [`api-reference.md`](api-reference.md) | Endpoints, auth, errors, the hospital contract |
| [`../HARDWARE_SPEC.md`](../HARDWARE_SPEC.md) | What to buy for a pilot, with costs |
| `frontend/docs/USER-GUIDE-TH.md` | คู่มือการใช้งาน, for coders and administrators |
| `backend/docs/api-contract.md` | Every field of every response, the contract of record |
| `backend/docs/DEPLOYMENT-PREP.md` | The 28-item checklist for running this in a real hospital |
