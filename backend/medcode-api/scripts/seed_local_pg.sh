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

# The committed dump was pg_dump'd on a machine whose Postgres role is named
# "hsuyi" — every object in it carries an "OWNER TO hsuyi", so restoring on a
# cluster without that role aborts partway through. It only needs to exist
# (never log in), so create it here rather than requiring a manual one-time
# fix on every machine.
"$PGBIN/psql" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'hsuyi'" \
  | grep -q 1 || "$PGBIN/psql" -d postgres -c 'CREATE ROLE hsuyi'

"$PGBIN/dropdb" --if-exists "$DB"
"$PGBIN/createdb" "$DB"
# NOTE: earlier dumps needed "DROP SCHEMA public CASCADE" here because they
# carried their own "CREATE SCHEMA public" (pg_dump -n public on PG15+). The
# current dump does NOT recreate it — its header says so explicitly ("*not*
# creating schema, since initdb creates it") and only ALTERs its owner — so
# dropping it first left nothing for the restore to attach to. If a future
# re-dump goes back to emitting CREATE SCHEMA public, this comment is the
# clue for why restores start failing with "schema public does not exist".
gunzip -c "$HERE/db/seed.sql.gz" | "$PGBIN/psql" -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB"
echo "Seeded local database '$DB'."
