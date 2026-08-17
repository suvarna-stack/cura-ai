#!/bin/bash
# Create the two databases the stack needs. The postgres image runs every file
# in this directory ONCE, on first boot of an empty data volume, in name order.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-'SQL'
    CREATE DATABASE medcode;
    CREATE DATABASE imed;
SQL

echo "initdb: created databases 'medcode' and 'imed'."
