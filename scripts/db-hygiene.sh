#!/usr/bin/env bash
# ============================================================
# scripts/db-hygiene.sh — Dispatch HQ nightly DB hygiene check
#
# READ-ONLY. Flags accounts that look disposable (verification /
# QA test registrations like savetest*, deploytest*, %@test.dev,
# %@example.com, numeric-prefixed usernames) so stray test rows
# get noticed automatically instead of only during manual sweeps.
# This script NEVER writes, deletes, or updates anything — it runs
# a pure SELECT and reports. Deleting anything is a manual,
# founder-reviewed step.
#
# Usage:
#   scripts/db-hygiene.sh [--limit=N] [--json]
#
#   --limit=N   cap how many flagged accounts are listed (default 50)
#   --json      emit a JSON report instead of the human table
#
# Environment:
#   DATABASE_URL
#       REQUIRED — psql connection string. There is deliberately NO dev
#       fallback here: the pinned service env is the only source of truth
#       (the dev credentials in src/config/devFallbacks must never be
#       queried by ops tooling). On the Zo instance, use the value from
#       the running service env (see the runbook §7 for the exact
#       discovery one-liner).
#       Optional webhook (Slack/Discord/ntfy-style) that receives a
#       JSON payload whenever the check finds disposable accounts.
#
# Exit codes:
#   0  clean — no disposable-pattern accounts found
#   1  found — at least one account matched a disposable pattern
#   2  error — usage / psql missing / DB unreachable
#
# Scheduling (on the Zo instance, nightly):
#   0 3 * * * DATABASE_URL="$(<service env discovery>)" bash \
#     /home/workspace/Projects/dispatch-hq/scripts/db-hygiene.sh \
#     >> /tmp/dhq-hygiene.log 2>&1
# ============================================================
set -uo pipefail

LIMIT="${DB_HYGIENE_LIMIT:-50}"
JSON=0
for arg in "$@"; do
  case "$arg" in
    --limit=*)
      LIMIT="${arg#--limit=}"
      ;;
    --json)
      JSON=1
      ;;
    --help|-h)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: scripts/db-hygiene.sh [--limit=N] [--json]" >&2
      exit 2
      ;;
  esac
done

# The limit is interpolated into SQL below — it must be a bare integer.
if ! [[ "$LIMIT" =~ ^[0-9]+$ ]]; then
  echo "Error: --limit must be a number (got: $LIMIT)" >&2
  exit 2
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL is required — the pinned service env is the only source of truth (no dev fallback in this script)." >&2
  echo "  On the Zo instance, discover it from the running service env (see plans/RELEASES.md runbook §7)." >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql not found — install postgresql-client or run this on the Zo instance" >&2
  exit 2
fi

# The disposable-pattern flag list, kept in one place. It mirrors exactly
# what the manual sweeps deleted from production (see plans/RELEASES.md §7):
#   - throwaway email domains: @test.dev/@test.com/@test.local/@example.com/@mail.com
#     (NOTE: @mail.com is a real free-email provider — a hit there deserves a
#     founder eyeball before any cleanup. This check only FLAGS; it never
#     deletes, so a false positive costs nothing but review time.)
#   - verification username prefixes: savetest/toktest/authtest_/deploytest/
#     testsave/smokeuser/pincheck/qauser
#   - timestamped numeric usernames like 1786057959user3
# The persistent smoke account (smoketest@dispatchhq.game) and the founder
# (deandrewh26@gmail.com) intentionally match NONE of these patterns.
SQL_FLAGS="
  SELECT id, username, email, level, credits, created_at, last_active
  FROM players
  WHERE email ILIKE '%@test.dev'
     OR email ILIKE '%@test.com'
     OR email ILIKE '%@test.local'
     OR email ILIKE '%@example.com'
     OR email ILIKE '%@mail.com'
     OR username ILIKE 'savetest%'
     OR username ILIKE 'toktest%'
     OR username ILIKE 'authtest_%'
     OR username ILIKE 'deploytest%'
     OR username ILIKE 'testsave%'
     OR username ILIKE 'smokeuser%'
     OR username ILIKE 'pincheck%'
     OR username ILIKE 'qauser%'
     OR username ~ '^[0-9]{6,}(user|test|qa|smoke)[0-9]*$'
  ORDER BY created_at
  LIMIT ${LIMIT};
"

SQL_COUNT="
  SELECT count(*) FROM players
  WHERE email ILIKE '%@test.dev'
     OR email ILIKE '%@test.com'
     OR email ILIKE '%@test.local'
     OR email ILIKE '%@example.com'
     OR email ILIKE '%@mail.com'
     OR username ILIKE 'savetest%'
     OR username ILIKE 'toktest%'
     OR username ILIKE 'authtest_%'
     OR username ILIKE 'deploytest%'
     OR username ILIKE 'testsave%'
     OR username ILIKE 'smokeuser%'
     OR username ILIKE 'pincheck%'
     OR username ILIKE 'qauser%'
     OR username ~ '^[0-9]{6,}(user|test|qa|smoke)[0-9]*$';
"

# Count first — the clean exit is the happy path and prints a clear summary.
COUNT_OUT="$(psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "$SQL_COUNT" 2>&1)"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "Error: DB query failed (rc=$RC):" >&2
  echo "$COUNT_OUT" | tail -5 >&2
  exit 2
fi
COUNT="$(printf '%s' "$COUNT_OUT" | tr -d '[:space:]')"

if [ "$COUNT" = "0" ]; then
  if [ "$JSON" -eq 1 ]; then
    printf '{"found":0,"accounts":[]}\n'
  else
    echo "DB hygiene: CLEAN — 0 disposable-pattern accounts (read-only check, nothing changed)."
  fi
  exit 0
fi

# Suspects found — fetch once as tuples (id|username|... rows only) for JSON
# and webhook parsing, and once aligned for the human-readable table.
FLAGS_TUPLES="$(psql "$DATABASE_URL" -X -A -t -F'|' -v ON_ERROR_STOP=1 -c "$SQL_FLAGS" 2>&1)"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "Error: flag-list query failed (rc=$RC):" >&2
  echo "$FLAGS_TUPLES" | tail -5 >&2
  exit 2
fi

if [ "$JSON" -eq 1 ]; then
  ACCOUNTS="["
  FIRST=1
  while IFS='|' read -r id username email level credits created_at last_active; do
    [ -z "${id:-}" ] && continue
    [ "$FIRST" -eq 0 ] && ACCOUNTS="$ACCOUNTS,"
    FIRST=0
    ACCOUNTS="$ACCOUNTS{\"id\":\"$id\",\"username\":\"$username\",\"email\":\"$email\",\"level\":$level,\"credits\":$credits,\"createdAt\":\"$created_at\",\"lastActive\":\"$last_active\"}"
  done <<< "$FLAGS_TUPLES"
  ACCOUNTS="$ACCOUNTS]"
  printf '{"found":%s,"accounts":%s}\n' "$COUNT" "$ACCOUNTS"
else
  FLAGS_TABLE="$(psql "$DATABASE_URL" -X -P pager=off -v ON_ERROR_STOP=1 -c "$SQL_FLAGS" 2>&1)"
  echo "DB hygiene: FOUND $COUNT disposable-pattern account(s) (read-only check, nothing changed):"
  echo
  echo "$FLAGS_TABLE"
fi

# Best-effort alert so a nightly run surfaces without anyone opening the log.
if [ -n "${DHQ_HYGIENE_ALERT_URL:-}" ]; then
  PAYLOAD="{\"found\":$COUNT,\"accounts\":["
  FIRST=1
  while IFS='|' read -r id username email level credits created_at last_active; do
    [ -z "${id:-}" ] && continue
    [ "$FIRST" -eq 0 ] && PAYLOAD="$PAYLOAD,"
    FIRST=0
    PAYLOAD="$PAYLOAD{\"id\":\"$id\",\"username\":\"$username\",\"email\":\"$email\",\"level\":$level,\"credits\":$credits,\"createdAt\":\"$created_at\",\"lastActive\":\"$last_active\"}"
  done <<< "$FLAGS_TUPLES"
  PAYLOAD="$PAYLOAD]}"
  curl -s -m 15 -X POST -H 'Content-Type: application/json' \
    -d "$PAYLOAD" "$DHQ_HYGIENE_ALERT_URL" >/dev/null 2>&1 || true
fi

exit 1
