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

- `db/seed.sql.gz` is the demo-start baseline (real sample data). Restoring is
  plain `psql` — no Python, no venv, no other repos or downloads needed. It
  holds the schema plus `coverage_types` and the ICD catalogs; every case table
  is EMPTY, which is what makes the dashboard start empty, and so is `users` —
  the admin is created on first boot from `ADMIN_BOOTSTRAP_EMAIL` /
  `ADMIN_BOOTSTRAP_PASSWORD` (defaults `admin@medcodeai.demo` / `admin1234`).
  It is data, but **not frozen**: it is also the only data the Docker stack
  boots from, so demo-data changes have to be dumped back into it. See
  `CLAUDE.md` for the `pg_dump` recipe.
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
| `IMED_CLIENT_ID` / `IMED_CLIENT_SECRET` | Client credentials for the hospital API. Traded for a short-lived Bearer token at `IMED_API_BASE/auth/token` (Basic auth, `grant_type=client_credentials`), renewed automatically. Defaults `medcode-mock-client` / `medcode-mock-secret` (the mock's); the real pair comes from the hospital's admin. Keep the secret out of Git. |
| `IMED_READ_TIMEOUT_SECONDS` | Read timeout for hospital calls. Default `60`. |
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

- The `password_hash` column is created by Flyway migration
  `V1__add_password_hash.sql`, and the bootstrap admin by `config/AdminBootstrap`
  at startup (hashing a password needs the `PasswordEncoder`, so it cannot be a
  `.sql` file). The frozen seed dump predates auth, so a re-seed drops both; the
  next boot re-applies the migration and re-creates the admin.
- Log in against `admin@medcodeai.demo` / `admin1234` locally (or your
  `ADMIN_BOOTSTRAP_*` overrides), then send `Authorization: Bearer <token>`.
- Implemented with `spring-security-crypto` (BCrypt only) plus a small
  `HandlerInterceptor` — deliberately **not** `spring-boot-starter-security`,
  which would auto-lock the public endpoints.

## Updating an existing database (pulling changes)

Schema changes made after the frozen `db/seed.sql.gz` dump live in
`src/main/resources/db/migrations/V*.sql` and are applied by **Flyway** at
startup. So on a machine that already has a working `medcode` database:

```bash
git pull
./mvnw spring-boot:run     # Flyway applies anything missing on boot
```

That is the whole procedure — no psql, no re-seed, and **your local data is kept**
(rows are moved, never recreated). Stop the app before pulling: old code against
a new schema errors, whereas new code against an old schema fixes itself.

The dump itself is Flyway's **version 0**. A database that already has content
but no `flyway_schema_history` table — every database that existed before
2026-08-20 — is adopted automatically (`baseline-on-migrate`), then brought up to
the latest version. Every migration is written `IF NOT EXISTS`, so a database
that already had these changes applied by the old `SchemaBootstrap` runner takes
them as no-ops.

| Version | Change |
|---|---|
| `V1` | `users.password_hash` |
| `V2` | `imed_write_ops` revert journal |
| `V3` | `icd_codes` split into `icd_10` + `icd_9` (2026-07-28) |
| `V4` | `case_codes.operation_start` / `_end` (2026-07-30) |
| `V5` | `case_codes.operation_type` + `case_vitals` (2026-07-30) |
| `V6` | the `cases` foreign keys `case_vitals` / `imed_write_ops` were missing (2026-08-20) |

Ask any database what it has:

```bash
psql -d medcode -c "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank"
```

For a database you can't boot the app against (prod, or a shared server), apply
the files by hand; each is guarded and safe to run twice:

```bash
psql -d medcode -f src/main/resources/db/migrations/V3__split_icd_codes.sql
```

**A re-seed undoes all of them.** `scripts/seed_local_pg.sh` restores the frozen
dump, which predates every migration — so `icd_codes` comes back, the admin
disappears, and the schema history goes with it. Start the app again and Flyway
re-applies the lot from version 0.

**Adding a schema change:** add one `V<n>__<name>.sql` file. That file is the
only place the change is written down — do NOT also add the DDL to Java. Before
Flyway, every statement lived in `config/SchemaBootstrap` AND in a `db/migrations`
file that nothing ever ran, and the two had silently drifted: `case_vitals` and
`imed_write_ops` were created without the foreign key that every other case-keyed
table carries (fixed in `V6`).

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

**The whole system in one command** — the sibling repo
[`medcode-stack`](https://github.com/Occamy-medihack/medcode-stack) runs all four
repos plus Postgres as five containers. Clone the five repos as siblings, then:

```bash
cd ../medcode-stack && cp .env.example .env && docker compose up -d --build
```

The app comes up on <http://localhost:8080> (nginx serves the SPA and proxies
`/api` here), with both databases seeded from the committed dumps. Docker is the
only prerequisite — no Java, Node, Python or PostgreSQL install needed. See that
repo's README for ports, env vars and the RAM/disk notes.

This service alone, against a database you already run:

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
