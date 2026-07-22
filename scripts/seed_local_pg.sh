#!/usr/bin/env bash
# Create + seed the local dev database from the committed dump.
# db/seed.sql.gz is the frozen demo baseline (originally produced by the
# audit_chart POC pipeline, dumped once) — plain psql, no Python. The dump
# holds only OUR schema; the hospital data lives in the separate "imed"
# database owned by ../imed-mock-api (see its scripts/seed_local_imed_pg.sh).
set -euo pipefail

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}"
DB="${DB:-medcode}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

"$PGBIN/dropdb" --if-exists "$DB"
"$PGBIN/createdb" "$DB"
# the dump carries its own CREATE SCHEMA public (pg_dump -n public on PG15+)
"$PGBIN/psql" -q -d "$DB" -c 'DROP SCHEMA public CASCADE'
gunzip -c "$HERE/db/seed.sql.gz" | "$PGBIN/psql" -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB"
echo "Seeded local database '$DB'."
