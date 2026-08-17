#!/bin/bash
# Restore medcode-api's committed demo baseline into the "medcode" database.
# Mirrors medcode-api/scripts/seed_local_pg.sh: the dump carries its own
# CREATE SCHEMA public (pg_dump -n public on PG15+), so drop the empty one the
# fresh database was created with, or the restore collides with it.
#
# NOT restored here: the auth columns, the bootstrap admin and the icd_10/icd_9
# catalog split. Those live outside the dump on purpose — medcode-api's
# SchemaBootstrap re-applies them idempotently at every startup.
set -euo pipefail

psql -q -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname medcode \
    -c 'DROP SCHEMA IF EXISTS public CASCADE'

gunzip -c /seed/medcode.sql.gz \
    | psql -q -o /dev/null -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname medcode

echo "initdb: seeded 'medcode' from /seed/medcode.sql.gz."
