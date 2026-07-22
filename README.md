# medcode-api

Spring Boot backend for MedCode AI (medical-coding audit dashboard). Started
as a query-for-query port of the Flask POC server
(`audit_chart/audit-chart_doc/integration-poc/server/`, now historical
reference only); as of 2026-07-22 **this backend owns the API contract** —
the old React frontend is being retired and the next one will be built
against [docs/api-contract.md](docs/api-contract.md) /
[docs/types.ts](docs/types.ts).

- Spring Boot 4.1 / Java 21, Maven (`./mvnw`), plain SQL — no JPA, no Python.
- Layers: `web/` (controllers) → `service/` (logic) → `repo/` (all SQL) +
  `client/` (outbound HTTP to the hospital's iMed API).
- Owns the `medcode` PostgreSQL database. Hospital data lives in the separate
  `imed` database owned by the sibling repo `../imed-mock-api` — this app
  never touches it directly, it only calls the iMed API (approval results on
  approve/reopen).

## Local dev — first-time setup included

**Just cloned this (or got it from a teammate)?** The databases are NOT
shipped pre-built — you create them yourself from the seed file committed in
each repo (`db/seed.sql.gz`). Keep the two repos as **sibling folders**
(`medcode-api`, `imed-mock-api`), then:

```bash
brew install postgresql@18 && brew services start postgresql@18   # once per machine
scripts/seed_local_pg.sh                               # builds db "medcode" (this repo)
cd ../imed-mock-api && scripts/seed_local_imed_pg.sh   # builds db "imed" (sibling repo)
./mvnw spring-boot:run                                 # :8003 fake hospital — keep it running
cd ../medcode-api && ./mvnw spring-boot:run            # :8001 this backend
```

Good to know:

- `db/seed.sql.gz` is the frozen demo baseline (real sample data, dumped once
  from the original POC pipeline). Restoring is plain `psql` — no Python, no
  venv, no other repos or downloads needed.
- **Re-running a seed script wipes that database back to the baseline** —
  handy reset, but it discards local approvals/edits.
- Java 21 required; `./mvnw` fetches Maven itself.
- Postgres not from Homebrew? Point `PGBIN` at your Postgres `bin` directory
  when running the seed scripts.

## Environment variables

| Var | Meaning |
|---|---|
| `DATABASE_URL` | libpq-form DSN (`postgresql://user:pass@host:port/db`); translated to JDBC automatically. Unset = `localhost:5432/medcode`. |
| `JDBC_DATABASE_URL` | Already-JDBC URL; wins over `DATABASE_URL`. |
| `IMED_API_BASE` | Base URL of the hospital iMed API — `../imed-mock-api` locally, the hospital's real API in production. Default `http://localhost:8003`. |
| `ALLOWED_ORIGINS` | CORS origins, `*` (default) or comma list. |
| `PORT` | HTTP port (default 8001). |

## The API

[docs/api-contract.md](docs/api-contract.md) — every endpoint with exact
request/response shapes and per-field nullability (each field maps to a real
DB column or a documented deliberate null).
[docs/types.ts](docs/types.ts) — the same contract as TypeScript types; the
next frontend imports/copies this file.

## Testing

```bash
./mvnw test
```

Prerequisites: Postgres running with **both** databases seeded (see Local
dev) and **imed-mock-api running on :8003** — approve/reopen make the
hospital calls for real. `CasesApiIntegrationTest` (`@SpringBootTest` +
MockMvc, no test containers, no HTTP stubs) is the project's correctness
gate: it drives the real read/write/approve/reopen/reset endpoints and checks
response shape and behavior directly.

## Docker

```bash
docker build -t medcode-api .
docker run -p 8002:8002 -e PORT=8002 \
  -e DATABASE_URL="postgresql://$USER@host.docker.internal:5432/medcode" \
  -e IMED_API_BASE="http://host.docker.internal:8003" medcode-api
```

## Deploy (production direction: GCP, decided 2026-07-21)

Target: **GCP with three containers** — this backend, `imed-mock-api`
(stand-in until the hospital provides the real iMed API; then it's just an
`IMED_API_BASE` change), and one stock `postgres:18` hosting the two
databases (`medcode`, `imed`), each seeded from its repo's committed
`db/seed.sql.gz`. Exact service (VM+compose vs Cloud Run vs GKE) not decided
yet.

- Configuration is env-only: see the table above (plus imed-mock-api's own).
- **Single medcode-api instance only**: the in-process cases cache + write
  lock assume one process. On Cloud Run that means `max-instances=1`.
- `/api/healthz` on both apps runs a real `SELECT COUNT(*)` — usable as the
  container health/liveness checks.

Migration plan + milestones: see `CLAUDE.md` (progress) and the full session
plan at `~/.claude-work/plans/what-is-current-backend-refactored-gosling.md`.
