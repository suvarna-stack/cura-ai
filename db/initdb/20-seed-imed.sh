#!/bin/bash
# Restore imed-mock-api's committed hospital baseline into the "imed" database.
# Mirrors imed-mock-api/scripts/seed_local_imed_pg.sh — note this dump keeps
# every table in a schema named "imed", not public (frozen into the dump from
# the pre-split single-database era), so there is no public schema to drop.
set -euo pipefail

# Strip ownership statements — same reason as 10-seed-medcode.sh: the dump
# names a role from the machine that took it, which does not exist here.
gunzip -c /seed/imed.sql.gz \
    | sed -E '/^ALTER [A-Z]+ .+ OWNER TO .+;$/d' \
    | psql -q -o /dev/null -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname imed

echo "initdb: seeded 'imed' from /seed/imed.sql.gz."
