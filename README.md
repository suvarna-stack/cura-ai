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

Migration plan + milestones: see the audit_chart session plan
(`what-is-current-backend-refactored-gosling.md`).
