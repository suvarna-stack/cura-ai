#!/usr/bin/env bash
# Create + seed the local "imed" database from the committed dump.
# db/seed.sql.gz is the frozen demo baseline (real hospital extract data,
# dumped once from the original POC pipeline) — plain psql, no Python.
set -euo pipefail

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}"
DB="${DB:-imed}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

"$PGBIN/dropdb" --if-exists "$DB"
"$PGBIN/createdb" "$DB"
gunzip -c "$HERE/db/seed.sql.gz" | "$PGBIN/psql" -q -v ON_ERROR_STOP=1 -d "$DB"
echo "Seeded local database '$DB'."
