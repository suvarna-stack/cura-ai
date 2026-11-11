# CURA AI

The whole CURA AI system in one repo. Each service lives in its own folder with
its own `Dockerfile`; the root `docker-compose.yml` runs them all plus Postgres
and owns only what lives *between* them — startup order, the env vars that point
the services at each other, the database, and the volumes.

The hospital's iMed API is **not** in this repo: the hospital builds and runs
it, and our backend reaches it through `IMED_API_BASE`.

## Layout

```
frontend/                  web UI          React + Vite, served by nginx
backend/                   our backend     Spring Boot, Java 21
ai/                        RAG service     FastAPI, Python
db/initdb/                 Postgres first-boot scripts
docs/  report/  eval-results/
docker-compose.yml         runs everything
```

Each folder still has its own README, `Dockerfile` and `.dockerignore`, and can be
built on its own: `docker build ./frontend`, `docker build ./ai`, and so on.

### For hospital developers building the iMed API

**Start with [`docs/for-hospital-developers.md`](docs/for-hospital-developers.md)**
— when we call each route, and what our code relies on from the real write-back.

Every hospital route lives on the hospital's server, and only our backend calls
them — the hospital never calls us:

- **Read, R1–R6** (case data, ICD code lists, a field check before each sync):
  we designed these, in
  `backend/docs/MedCode-AI-iMed-Integration-API-Contract-v1.pdf`.
- **Write, W1–W4** (add, change and cancel codes on approve/reopen): the
  hospital's own existing spec. We only asked for one extra field,
  `coding_status`.

The hospital's own guide for MedCode (4 Nov 2026) wins wherever it differs from
our PDF — R1 was not built, and login is client credentials at `/auth/token`.
The differences are listed at the top of `backend/docs/imed-integration.md`, and
every route is summed up in `docs/api-reference.md`. The code that calls them is
`backend/src/main/java/com/medcodeai/api/client/ImedApiClient.java`. Pointing
our backend at your API is three settings in `.env`: `IMED_API_BASE`,
`IMED_CLIENT_ID` and `IMED_CLIENT_SECRET`.

These folders were separate repos until 2026-11-10 (`audit-chart-frontend`,
`medcode-api`, `RAG`, `medcode-stack`); their full git history is kept here.
`imed-mock-api`, our stand-in for the hospital, was merged too and removed the
same day.

## Documentation

| Document | What |
|---|---|
| [`docs/setup-guide.md`](docs/setup-guide.md) | From a clean clone to a working system, with troubleshooting |
| [`docs/architecture.md`](docs/architecture.md) | Topology, the coding flow, approve/write-back, the AI pipeline, data model, known gaps |
| [`docs/api-reference.md`](docs/api-reference.md) | Endpoints, auth, errors, streaming, the hospital contract |
| [`HARDWARE_SPEC.md`](HARDWARE_SPEC.md) | What to buy for a pilot, with costs and open questions |
| [`report/CURA-AI-Report.pdf`](report/CURA-AI-Report.pdf) | The final report, in Thai (build: `report/build-report.sh`) |
| `frontend/docs/USER-GUIDE-TH.pdf` | คู่มือการใช้งาน — Thai user guide for coders and administrators |
| [`eval-results/`](eval-results/) | Raw test, load-test and AI-accuracy evidence |

## Prerequisites

- Docker (Docker Desktop, Colima, OrbStack — any Docker Engine 20.10+), given
  **at least 4GB of RAM** in its settings
- Ollama running on the **host**, if you want AI generation (see below)
- No native Postgres on port 5433 and nothing on 8080/8001/8000
- The hospital's iMed API, reachable from this machine, for Sync, Approve and
  Reopen (see below)

Nothing else: no Java, Node, Python or PostgreSQL install is needed — every
build happens inside the images. Windows and Linux work the same as macOS (on
Windows use Docker Desktop with the WSL2 backend, and run the commands from
PowerShell or a WSL shell).

Don't want Docker? See `backend/RUN-ALL.md` for the manual,
three-terminal path (no containers, Thai-language).

## Run it

```bash
cp .env.example .env      # set IMED_API_BASE + client id/secret; edit ports/passwords if you like
docker compose up -d --build
```

Then open **http://localhost:8080** and log in with the admin from `.env`
(`ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD`, default
`admin@medcodeai.demo` / `admin1234`).

> The backend creates that admin **once**, on the first start with an empty
> accounts table. Editing `.env` afterwards changes nothing — change the
> password in the app instead: **Accounts → edit the admin → new password**.
> Set a real password in `.env` *before* the first start of any deployment.
> (Seed dumps before 2026-11-11 shipped demo accounts, including an admin with
> `admin1234`; if your `pgdata` volume is older than that, run
> `docker compose down -v` once to start clean.)

The dashboard starts empty: every case arrives by **Sync** from the hospital's
iMed API. Without that API the app still starts and you can log in, but Sync,
Approve and Reopen fail. If `IMED_API_BASE` is left blank, the backend looks for
it on port 8003 of this machine.

**Reset demo** resets our side, then asks the hospital to reset too. Only the
old mock could do that, so against the real hospital API it answers an error —
our side has still been reset.

First run takes a while: a Maven build, an npm build, and a PyTorch install.
Later runs are cached.

```bash
docker compose ps                 # health of all four services
docker compose logs -f medcode-api
docker compose down               # stop, keep data
docker compose down -v            # stop and WIPE the database + RAG index
```

## What runs where

| Service | Host port | Inside the network |
|---|---|---|
`web` (nginx + SPA) | http://localhost:8080 | `web:8080` |
`medcode-api` | http://localhost:8001 | `medcode-api:8001` |
`rag` | http://localhost:8000 | `rag:8000` |
`db` (Postgres 18) | `localhost:5433` | `db:5432` |

Two host ports differ from the native setup on purpose, so this
stack can run **alongside** it: the web UI is on **8080** (5173 belongs to the
vite dev server) and Postgres on **5433** (5432 belongs to Homebrew Postgres).
All ports are overridable in `.env`.

### The browser only ever talks to port 8080

The SPA is built with `VITE_API_BASE_URL=/api`, and nginx proxies `/api` to
`medcode-api`. That means one origin, so **no CORS**, and the same image works in
every environment — nothing about the backend's address is baked into the bundle.
Port 8001 is still published for Swagger and `curl`, but the app doesn't use it.

## The database

Postgres holds one database, `medcode`, restored from the committed dump in
`backend/db/` by the scripts in `db/initdb/`. The hospital's data
stays in the hospital: we only reach it over its API.

Those scripts run **only once**, when the `pgdata` volume is empty. To re-seed:

```bash
docker compose down -v && docker compose up -d
```

### Pulling updated demo data — read this before `git pull`

Compose bind-mounts the seed dump `backend/db/seed.sql.gz` at
`/seed/medcode.sql.gz`.

One `git pull` gets you a new dump, but **`docker compose up -d` will silently
ignore it.** The scripts in `db/initdb/` are run by the postgres image only on
an *empty* `pgdata` volume. If you have ever started this stack, that volume is
populated, the new dump is mounted at `/seed/` and never read, and nothing
errors — you just quietly keep the old data.

So the whole update is:

```bash
git pull
docker compose down -v          # the -v is the load-bearing part
docker compose up -d --build
```

`down -v` destroys the database and the RAG index. That is fine here — both are
rebuilt from committed files — but it also destroys **any approvals made in
this stack**, since they live only in the `pgdata` volume. (Codes already written
back to the hospital stay there.)

The schema is owned by `medcode-api`'s Flyway migrations
(`backend/src/main/resources/db/migrations/V1…V9`), which run at every startup
and add whatever a database is missing. So a schema problem is never fixed by
editing the dump — start the app. The bootstrap admin is not a migration:
`AdminBootstrap` creates it only when no admin exists (see the note under
**Run it**).

Reach it from the host with:

```bash
psql -h localhost -p 5433 -U postgres -d medcode
```

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

The full stack is a JVM, a PyTorch process, nginx and Postgres. Give Docker
**at least 4GB** of RAM, 6GB if you also run Ollama's 8B model on the same
machine — an 8GB laptop cannot comfortably do both at once. If Ollama is
squeezed, run the stack with `LLM_BACKEND=transformers`, or run RAG natively and
`docker compose up db medcode-api web`.

Disk: roughly 4–5GB of images with the defaults. `PREFETCH_EMBED_MODEL=1` adds
about 3GB more but makes the RAG image self-contained and offline-capable, which
is what you want for a CI-built image or a hospital demo on a strange network.

## Running the test suites

The suites are not containerized — they run on the host against this stack:

```bash
# medcode-api needs the database and a hospital iMed API reachable
cd backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/medcode \
IMED_API_BASE=https://<hospital-test-server> ./mvnw test
```

`CasesApiIntegrationTest` approves and reopens for real, so it **writes to the
hospital API**. Run it only against a hospital test server. Its fixed case IDs
come from the old mock's demo data, so expect failures against other data.

Tests that need neither the database nor the hospital run anywhere — for
example `./mvnw test -Dtest='ImedWritebackGuideTest,SyncRulesTest'`, the first
of which checks our write requests against the hospital's guide. The AI service
has its own suite: `cd ai && pytest -q` (see `ai/README.md`).

## Production is not this file

Compose is for local dev, demos and onboarding. For the M7 GCP cutover, each folder
builds and pushes its **own** image and Cloud Run wires them with the same env
vars used here. Four things to carry over:

- `medcode-api` must stay at **one instance** (`max-instances=1`) — its write
  lock and cases cache are in-process.
- Build for the target architecture: these Macs are arm64, GCP is amd64
  (`docker buildx build --platform linux/amd64`).
- The image forces `SWAGGER_ENABLED=false` and `DEMO_TOOLS_ENABLED=false`; this
  compose file deliberately turns them back on. Don't carry that over.
- Replace every default password and put the real ones in Secret Manager.
