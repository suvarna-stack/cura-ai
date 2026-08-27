#!/bin/bash
# Restore medcode-api's committed demo baseline into the "medcode" database.
#
# NOT restored here: the auth columns, the bootstrap admin and the icd_10/icd_9
# catalog split. Those live outside the dump on purpose — medcode-api applies
# them at every startup, via its Flyway migrations (V1__add_password_hash.sql,
# V3__split_icd_codes.sql) and AdminBootstrap. The dump therefore ships with no
# flyway_schema_history, so baseline-on-migrate adopts it as version 0.
set -euo pipefail

# Two things are filtered out of the dump on the way in. Both exist because the
# dumps are taken by hand on a developer's machine, so what pg_dump emits
# depends on that machine rather than on anything this repo controls.
#
# 1. Ownership. pg_dump stamps every object with that machine's role name
#    ("ALTER TABLE public.cases OWNER TO hsuyi;"). No such role exists in this
#    container, so with ON_ERROR_STOP=1 the first one aborts the entire restore
#    and db never becomes healthy. Dropping the lines is what --no-owner would
#    have done: every object lands owned by $POSTGRES_USER, which is what we
#    want in a container anyway. Anchored on ^ALTER ... ;$ so COPY data is safe.
#
# 2. CREATE SCHEMA public. A whole-database dump (what we have) writes
#    "-- *not* creating schema, since initdb creates it" and relies on the empty
#    public schema that CREATE DATABASE already provides. A dump taken with
#    -n public writes CREATE SCHEMA public instead, which would then collide
#    with that same schema. Stripping the line makes both styles restore
#    identically, so a future re-dump cannot break this again.
#
# This is also why nothing is dropped first: an earlier version of this script
# ran DROP SCHEMA public CASCADE, which was correct for the -n public dump and
# fatal for this one ("schema public does not exist" on the first CREATE TYPE).
gunzip -c /seed/medcode.sql.gz \
    | sed -E -e '/^ALTER [A-Z]+ .+ OWNER TO .+;$/d' -e '/^CREATE SCHEMA public;$/d' \
    | psql -q -o /dev/null -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname medcode

echo "initdb: seeded 'medcode' from /seed/medcode.sql.gz."
