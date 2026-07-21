#!/usr/bin/env bash
# Create + seed the local dev database from the audit_chart POC baselines.
# Mirrors exactly how Supabase was seeded (schema files first, then
# migrate_to_pg.py over the committed .db files), so local data == prod data.
#
# Requires: Homebrew postgresql@18 running, and the repo venv
# (.venv, with psycopg2-binary) — see README.
set -euo pipefail

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}"
DB="${DB:-medcode}"
POC="${POC:-$HOME/Desktop/development/audit_chart/audit-chart_doc/integration-poc}"
PY="${PY:-$(cd "$(dirname "$0")/.." && pwd)/.venv/bin/python}"

"$PGBIN/dropdb" --if-exists "$DB"
"$PGBIN/createdb" "$DB"
"$PGBIN/psql" -q -v ON_ERROR_STOP=1 -d "$DB" -f "$POC/medcodeai/schema_postgres.sql"
"$PGBIN/psql" -q -v ON_ERROR_STOP=1 -d "$DB" -f "$POC/imed_mock/schema_postgres.sql"
# migrate_to_pg.py resolves the .db files relative to its cwd
(cd "$POC" && "$PY" migrate_to_pg.py --dsn "postgresql://localhost:5432/$DB" --truncate)
echo "Seeded local database '$DB'."
