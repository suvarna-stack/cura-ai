# medcode-api

Spring Boot rewrite of the MedCode AI POC backend, originally ported
query-for-query from a Flask reference server (`audit_chart/audit-chart_doc/integration-poc/server/`).
As of 2026-07-22 this backend intentionally diverges from that reference for
fields the underlying data never actually had (confidence, patient name, HN,
dates, revenue band — see `CLAUDE.md`): it returns real DB values instead of
Flask's synthesized placeholder data. Frontend contract reconciliation
(`audit_chart/src/api/types.ts`) is a separate, not-yet-done step.

- Spring Boot 4.1 / Java 21, Maven (`./mvnw`), plain `JdbcClient` SQL — no JPA.
- PostgreSQL only: Supabase in prod, local Homebrew `postgresql@18` for dev.
- Layers: `web/` (controllers) → `service/` (logic) → `repo/` (all SQL, each
  method commented with its Python source, e.g. `// views.py:117`).

## Local dev

```bash
brew services start postgresql@18
python3 -m venv .venv && .venv/bin/pip install psycopg2-binary
scripts/seed_local_pg.sh          # creates + seeds db "medcode" from the POC baselines
./mvnw spring-boot:run            # :8001, connects to localhost:5432/medcode by default
```

## Environment variables

| Var | Meaning |
|---|---|
| `DATABASE_URL` | libpq-form DSN (`postgresql://user:pass@host:port/db`) — Supabase session pooler; translated to JDBC automatically. Unset = `localhost:5432/medcode`. |
| `JDBC_DATABASE_URL` | Already-JDBC URL; wins over `DATABASE_URL`. |
| `ALLOWED_ORIGINS` | CORS origins, `*` (default) or comma list. |
| `PORT` | HTTP port (default 8001). |

## Testing

```bash
./mvnw test
```

`CasesApiIntegrationTest` runs against the local seeded `medcode` Postgres
(`@SpringBootTest` + MockMvc, no test containers) and is the project's
correctness gate: it drives the real read/write/approve/reopen/reset
endpoints and checks response shape and behavior directly — it does not diff
against the old Flask reference (see `CLAUDE.md` — several fields
deliberately diverge from Flask's synthesized placeholder data now).

## Docker

```bash
docker build -t medcode-api .
docker run -p 8002:8002 -e PORT=8002 \
  -e DATABASE_URL="postgresql://$USER@host.docker.internal:5432/medcode" medcode-api
```

## Deploy (production direction: GCP, decided 2026-07-21)

Production will NOT use Supabase (cost). Target: **GCP with one container for
this backend and one for Postgres** (exact service — VM+compose vs Cloud Run
vs GKE — not decided yet). What already fits that plan:

- The Dockerfile is the backend container; a stock `postgres:18` image is the
  DB container (same major version as local dev — no dump-compat surprises).
- Configuration is env-only: `DATABASE_URL` (or `JDBC_DATABASE_URL`),
  `ALLOWED_ORIGINS` (the Netlify origin), `PORT`.
- Seeding a fresh Postgres = the two `schema_postgres.sql` files +
  `migrate_to_pg.py` (see `scripts/seed_local_pg.sh` for the exact sequence).
- **Single backend instance only**: the in-process cases cache + write lock
  assume one process (Flask ran `gunicorn --workers 1` for the same reason).
  On Cloud Run that means `max-instances=1`.
- `/api/healthz` runs a real `SELECT COUNT(*)` — usable as the container
  health/liveness check.

Migration plan + milestones: see `CLAUDE.md` (progress) and the full session
plan at `~/.claude-work/plans/what-is-current-backend-refactored-gosling.md`.
