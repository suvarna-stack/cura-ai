#!/usr/bin/env bash
# Create + seed the local "imed" database from the committed dump.
# db/seed.sql.gz is the frozen demo baseline (real hospital extract data,
# dumped once from the original POC pipeline) — plain psql, no Python.
set -euo pipefail

DB="${DB:-imed}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

# Homebrew's location first (the common case here), then anything on PATH, so
# a Windows/Linux/EDB install works without setting PGBIN by hand.
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}"
if [ ! -x "$PGBIN/psql" ] && [ ! -x "$PGBIN/psql.exe" ]; then
    if command -v psql >/dev/null 2>&1; then
        PGBIN="$(dirname "$(command -v psql)")"
    else
        echo "error: no psql on PATH and none at $PGBIN" >&2
        echo "       Install PostgreSQL, or point PGBIN at its bin directory." >&2
        exit 1
    fi
fi

# psql/dropdb/createdb read PGUSER, PGPASSWORD, PGHOST and PGPORT themselves.
# With none set, libpq logs in as the OS account name — which only works where
# a role of that name exists (Homebrew creates one; most installers do not,
# their only superuser being "postgres"). Hence the hint below.
on_error() {
    echo >&2
    echo "Seeding failed as PostgreSQL user '${PGUSER:-$(whoami)}'." >&2
    echo "If the server is running and that is not a valid role, retry with:" >&2
    echo >&2
    echo "    PGUSER=postgres PGPASSWORD=<password> $0" >&2
    echo >&2
    echo "(PGPASSWORD matters too — without it every command prompts separately.)" >&2
}
trap on_error ERR

"$PGBIN/dropdb" --if-exists "$DB"
"$PGBIN/createdb" "$DB"
gunzip -c "$HERE/db/seed.sql.gz" | "$PGBIN/psql" -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB"
echo "Seeded local database '$DB'."
