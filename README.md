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

## Deploy (Render free tier, like the Flask POC)

- New Web Service from this repo, runtime **Docker** (the Dockerfile builds and
  runs the jar). Health check path: `/api/healthz` — keep the UptimeRobot ping
  on it: the same request keeps the instance warm AND counts as Supabase DB
  activity (free projects pause after 7 idle days).
- Env vars: `DATABASE_URL` = the Supabase **session pooler** DSN
  (`postgresql://...pooler.supabase.com:5432/postgres` — translated to JDBC
  automatically), `ALLOWED_ORIGINS` = `*` or the Netlify origin. Render sets
  `PORT` itself.
- Single instance only: the in-process cases cache + write lock assume one
  process (same as the Flask deploy's `gunicorn --workers 1`).
- Before cutover check Supabase's Postgres major version (`select version();`)
  — local dev runs 18; never restore a local pg_dump into an older server.

Migration plan + milestones: see the audit_chart session plan
(`what-is-current-backend-refactored-gosling.md`).
