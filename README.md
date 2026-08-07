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

> **รันทั้งระบบ (4 repo) ครั้งแรก?** → [RUN-ALL.md](RUN-ALL.md) — คู่มือภาษาไทย
> ครอบคลุม imed-mock-api + medcode-api + RAG + audit-chart-frontend ตั้งแต่
> เครื่องเปล่า เอกสารด้านล่างนี้เป็นของ repo นี้ repo เดียว

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

**Shortcut — one line to bring it all up** (macOS/Linux only; these scripts are
bash and shell out to `lsof`/`brew`. On Windows run the manual steps above in
separate terminals — see `RUN-ALL.md` §5, the portable path — or use WSL/Git Bash):

```bash
scripts/dev.sh          # seeds anything missing, starts the fake hospital (:8003),
                        # then runs this backend (:8001). Ctrl-C stops both.
scripts/dev.sh --seed   # force a fresh re-seed of BOTH databases first (wipes local data)
```

It prints the Swagger URL and the admin login (`admin@medcodeai.demo` /
`admin1234`) once ready. Postgres must be installed; it will `brew services
start` it if it's not already running. Keep the two repos as sibling folders (or
set `IMED_DIR`).

`dev.sh` covers the two backends only. The full product is four repos — add
RAG (`:8000`) and the frontend (`:5173`) in their own terminals; the complete
runbook for all four, on every OS, is `RUN-ALL.md`.

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
| `IMED_API_TOKEN` | Bearer token for the hospital's `/api/v1` write endpoints. Default `imed-mock-token` (the mock's default); the real token comes from the hospital. |
| `ALLOWED_ORIGINS` | CORS origins, `*` (default) or comma list. |
| `PORT` | HTTP port (default 8001). |
| `SWAGGER_ENABLED` | Swagger UI + `/v3/api-docs`. Default `true` when running locally, forced `false` in the Docker image (so every container, incl. GCP, ships without it). |
| `ADMIN_BOOTSTRAP_EMAIL` | Email of the admin created at first startup when no admin exists. Default `admin@medcodeai.demo`. |
| `ADMIN_BOOTSTRAP_PASSWORD` | Password for that bootstrap admin. Default `admin1234` — **override and change it before any real deployment** (a WARN logs when the default is used). |
| `SESSION_TTL_DAYS` | Login-session lifetime in days (default `7`). |
| `DEMO_TOOLS_ENABLED` | Enables `POST /api/demo/reset` (a public bulk write). Default `true` locally; forced `false` in the Docker image, where the endpoint returns `404`. |
| `LOGIN_MAX_ATTEMPTS` | Failed logins allowed per email before lockout (default `5`). |
| `LOGIN_LOCKOUT_SECONDS` | Lockout window in seconds once `LOGIN_MAX_ATTEMPTS` is hit (default `900`); a successful login clears the count. |

## Admin authentication

Auth guards the **admin dashboard only** (login, account management, dashboard
cards); the case/approve/sync endpoints stay public. Email + per-account BCrypt
password, roles `coder`/`admin`, opaque Bearer tokens stored server-side in
`auth_sessions`. Full endpoint shapes: [docs/api-contract.md](docs/api-contract.md)
(Authentication section) / [docs/types.ts](docs/types.ts).

- The `password_hash` column and a bootstrap admin are created **at startup**,
  idempotently (`config/SchemaBootstrap`) — the frozen seed dump predates auth
  and there is no migration tool. The same DDL is in
  `db/migrations/0001_add_password_hash.sql` for manual/prod application. A
  re-seed drops the column; the next boot re-adds it (and re-creates the admin).
- Log in against `admin@medcodeai.demo` / `admin1234` locally (or your
  `ADMIN_BOOTSTRAP_*` overrides), then send `Authorization: Bearer <token>`.
- Implemented with `spring-security-crypto` (BCrypt only) plus a small
  `HandlerInterceptor` — deliberately **not** `spring-boot-starter-security`,
  which would auto-lock the public endpoints.

## Updating an existing database (pulling changes)

There is no migration tool. Schema changes made after the frozen `db/seed.sql.gz`
dump are applied **at startup**, idempotently, by `config/SchemaBootstrap`. So on
a machine that already has a working `medcode` database:

```bash
git pull
./mvnw spring-boot:run     # applies anything missing on boot
```

That is the whole procedure — no psql, no re-seed, and **your local data is kept**
(rows are moved, never recreated). Stop the app before pulling: old code against
a new schema errors, whereas new code against an old schema fixes itself.

Applied on boot today:

| Change | Also committed as |
|---|---|
| `users.password_hash` + bootstrap admin | `db/migrations/0001_add_password_hash.sql` |
| `imed_write_ops` revert journal | `db/migrations/0002_imed_write_ops.sql` |
| `icd_codes` split into `icd_10` + `icd_9` (2026-07-28) | `db/migrations/0003_split_icd_codes.sql` |

Check it worked — `icd_codes` should be gone, replaced by two tables:

```bash
psql -d medcode -c "\dt" | grep icd
```

For a database you can't boot the app against (prod, or a shared server), apply
the migration files by hand instead; each is safe to run twice:

```bash
psql -d medcode -f db/migrations/0003_split_icd_codes.sql
```

**A re-seed undoes these.** `scripts/seed_local_pg.sh` restores the frozen dump,
which predates all three changes — so `icd_codes` comes back and the admin
disappears. Just start the app again and they re-apply.

## The API

[docs/api-contract.md](docs/api-contract.md) — every endpoint with exact
request/response shapes and per-field nullability (each field maps to a real
DB column or a documented deliberate null).
[docs/types.ts](docs/types.ts) — the same contract as TypeScript types; the
next frontend imports/copies this file.

**Swagger UI: <http://localhost:8001/swagger-ui.html>** — an interactive
console for poking the endpoints by hand (handy for the write ones, whose
bodies are easy to get wrong). It is a dev tool, **not** the contract: the
controllers return `Map`, so the generated schemas are bare `object` and the
real shapes come from hand-written examples on each method. `api-contract.md`
above stays the source of truth. Off in containers — set
`SWAGGER_ENABLED=true` to override.

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
