# medcode-api

Spring Boot rewrite of the MedCode AI POC backend (the Flask server at
`audit_chart/audit-chart_doc/integration-poc/server/`, which stays untouched as
the frozen reference implementation). Serves the exact same JSON contract
(`audit_chart/src/api/types.ts`) so the React frontend switches over by
changing `VITE_API_BASE` only.

- Spring Boot 4.1 / Java 21, Maven (`./mvnw`), plain `JdbcClient` SQL — no JPA.
- PostgreSQL only: Supabase in prod, local Homebrew `postgresql@18` for dev.
- Layers: `web/` (controllers) → `service/` (logic) → `repo/` (all SQL, each
  method commented with its Python source, e.g. `// views.py:117`).

## Local dev

```bash
brew services start postgresql@18
python3 -m venv .venv && .venv/bin/pip install psycopg2-binary flask flask-cors requests
scripts/seed_local_pg.sh          # creates + seeds db "medcode" from the POC baselines
./mvnw spring-boot:run            # :8001, connects to localhost:5432/medcode by default
```

Reference Flask server on the same DB (for parity):

```bash
cd ../audit_chart/audit-chart_doc/integration-poc/server
DATABASE_URL=postgresql://localhost:5432/medcode PORT=8000 ../../../../medcode-api/.venv/bin/python app.py
```

## Environment variables

| Var | Meaning |
|---|---|
| `DATABASE_URL` | libpq-form DSN (`postgresql://user:pass@host:port/db`) — Supabase session pooler; translated to JDBC automatically. Unset = `localhost:5432/medcode`. |
| `JDBC_DATABASE_URL` | Already-JDBC URL; wins over `DATABASE_URL`. |
| `ALLOWED_ORIGINS` | CORS origins, `*` (default) or comma list. |
| `PORT` | HTTP port (default 8001). |

## Parity harness (the correctness gate)

The Flask server is the frozen reference; these scripts prove the clone:

```bash
.venv/bin/python scripts/gen_fakes_golden.py     # regenerate the JUnit golden file
.venv/bin/python scripts/parity_read.py          # cases.json + every detail + healthz + 404
.venv/bin/python scripts/parity_write.py --with-reset
    # clones the DB twice, drives the same write sequence through both
    # servers, diffs every response AND the full pg_dump of both DBs
```

`parity_write.py` needs no servers running (it spawns its own on :8100/:8101
and needs the `medcode` template DB connection-free).

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
