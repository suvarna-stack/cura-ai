#!/usr/bin/env bash
# One-line local bring-up.
#
#   scripts/dev.sh          # seed anything missing, start the fake hospital
#                           # (imed-mock-api :8003), then run this backend (:8001)
#   scripts/dev.sh --seed   # force a FRESH re-seed of BOTH databases first
#                           # (WIPES local approvals/edits back to the baseline)
#
# Ctrl-C stops everything this script started. Login once it's up:
#   admin@medcodeai.demo / admin1234
#   (override with ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD)
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
IMED_DIR="${IMED_DIR:-$HERE/../imed-mock-api}"
MEDCODE_PORT="${PORT:-8001}"
IMED_PORT="8003"
LOGDIR="${TMPDIR:-/tmp}/medcode-dev"; mkdir -p "$LOGDIR"
FORCE_SEED=0; [ "${1:-}" = "--seed" ] && FORCE_SEED=1

log()  { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# --- locate psql (Homebrew first, then PATH), same as the seed scripts -----
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}"
if [ ! -x "$PGBIN/psql" ]; then
  command -v psql >/dev/null 2>&1 || die "no psql found — install PostgreSQL or set PGBIN"
  PGBIN="$(dirname "$(command -v psql)")"
fi

# --- Postgres reachable? (try to start Homebrew's if not) ------------------
if ! "$PGBIN/pg_isready" -q >/dev/null 2>&1; then
  log "Postgres not responding — starting it (brew services)…"
  brew services start postgresql@18 >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do "$PGBIN/pg_isready" -q >/dev/null 2>&1 && break; sleep 1; done
  "$PGBIN/pg_isready" -q >/dev/null 2>&1 || die "Postgres still not up"
fi

# --- seed each database only if it's missing (or if --seed) ----------------
db_has() { # db_has <database> <schema.table>
  local out; out="$("$PGBIN/psql" -tAqX -d "$1" -c "SELECT to_regclass('$2')" 2>/dev/null || true)"
  [ -n "$out" ]
}
if [ "$FORCE_SEED" = 1 ]; then
  log "--seed: re-seeding BOTH databases (wipes local approvals/edits)"
  "$HERE/scripts/seed_local_pg.sh"
  "$IMED_DIR/scripts/seed_local_imed_pg.sh"
else
  db_has medcode public.cases         || { log "Seeding 'medcode'…"; "$HERE/scripts/seed_local_pg.sh"; }
  db_has imed    imed.medhack_patient || { log "Seeding 'imed'…";    "$IMED_DIR/scripts/seed_local_imed_pg.sh"; }
fi

# --- helpers to start/stop the two Spring Boot apps ------------------------
health()  { curl -s -o /dev/null -w '%{http_code}' "http://localhost:$1/api/health" 2>/dev/null; }
kill_port() { local p; p="$(lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true)"; [ -n "$p" ] && kill $p 2>/dev/null || true; }
wait_up() { # wait_up <port> <name> <logfile>
  for _ in $(seq 1 120); do
    [ "$(health "$1")" = "200" ] && { log "$2 is up on :$1"; return 0; }
    sleep 1
  done
  echo; tail -40 "$3" 2>/dev/null; die "$2 did not come up on :$1 (see $3)"
}

STARTED_IMED=0
cleanup() {
  [ -n "${CLEANED:-}" ] && return; CLEANED=1
  [ -n "${TAIL_PID:-}" ] && kill "$TAIL_PID" 2>/dev/null || true
  [ -n "${MEDCODE_PID:-}" ] && { kill "$MEDCODE_PID" 2>/dev/null || true; kill_port "$MEDCODE_PORT"; }
  if [ "$STARTED_IMED" = 1 ]; then kill "${IMED_PID:-}" 2>/dev/null || true; kill_port "$IMED_PORT"; log "stopped imed-mock-api"; fi
}
trap 'exit 130' INT TERM
trap cleanup EXIT

# --- fake hospital (dependency of approve/reopen/sync) ---------------------
if [ "$(health "$IMED_PORT")" = "200" ]; then
  log "imed-mock-api already running on :$IMED_PORT — reusing it"
else
  [ -x "$IMED_DIR/mvnw" ] || die "imed-mock-api not found at $IMED_DIR (keep the repos as siblings, or set IMED_DIR)"
  log "Starting imed-mock-api (fake hospital) on :$IMED_PORT — logs: $LOGDIR/imed.log"
  ( cd "$IMED_DIR" && exec ./mvnw -q spring-boot:run ) > "$LOGDIR/imed.log" 2>&1 &
  IMED_PID=$!; STARTED_IMED=1
  wait_up "$IMED_PORT" "imed-mock-api" "$LOGDIR/imed.log"
fi

# --- this backend ----------------------------------------------------------
[ "$(health "$MEDCODE_PORT")" = "200" ] && die "something already serves :$MEDCODE_PORT — is medcode-api already running?"
log "Starting medcode-api on :$MEDCODE_PORT — logs: $LOGDIR/medcode.log"
( cd "$HERE" && exec ./mvnw -q spring-boot:run ) > "$LOGDIR/medcode.log" 2>&1 &
MEDCODE_PID=$!
wait_up "$MEDCODE_PORT" "medcode-api" "$LOGDIR/medcode.log"

# --- ready banner ----------------------------------------------------------
cat <<EOF

  ✅  medcode-api is ready.

  Swagger UI      http://localhost:$MEDCODE_PORT/swagger-ui.html
  Health          http://localhost:$MEDCODE_PORT/api/healthz
  Admin login     ${ADMIN_BOOTSTRAP_EMAIL:-admin@medcodeai.demo} / ${ADMIN_BOOTSTRAP_PASSWORD:-admin1234}
  Fake hospital   http://localhost:$IMED_PORT   (imed-mock-api)

  Following medcode-api logs — press Ctrl-C to stop everything this script started.

EOF

# tail in the background + wait: bash's `wait` is interruptible by the INT/TERM
# trap, so Ctrl-C (or a plain kill) tears everything down promptly. A bare
# foreground `tail -f` would defer the trap until it exited (i.e. never).
tail -f "$LOGDIR/medcode.log" & TAIL_PID=$!
wait "$TAIL_PID"
