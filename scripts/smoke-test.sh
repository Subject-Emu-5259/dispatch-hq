#!/usr/bin/env bash
# ============================================================
# scripts/smoke-test.sh — Dispatch HQ save-health smoke test
#
# A scheduled health probe for the live game. Hits /health, then
# performs a real login (register on first run) → save (including
# a numeric-slot payload, the shape that once crashed the save
# endpoint with "slot.trim is not a function") → list → load
# round-trip, then cleans up. Exits 0 when healthy, 1 when any
# step fails.
#
# Usage:
#   scripts/smoke-test.sh [BASE_URL] [--expect-version X.Y.Z] [--no-litter]
#
#   BASE_URL          default: https://dispatch-hq-deandrewharris.zocomputer.io
#   --expect-version  fail if /health does not report this version
#   --no-litter       self-cleanup guard: after the first successful auth it
#                     records the smoke account's player id in a state file,
#                     and refuses to run (or register a replacement) if a later
#                     run's credentials don't match — so an accidental
#                     SMOKE_EMAIL change can never spawn a second disposable
#                     account or touch a real user's data.
#
# Environment:
#   SMOKE_EMAIL / SMOKE_PASSWORD
#       Credentials for ONE persistent smoke account (login first,
#       register only on the very first run). Reusing a single
#       account means the probe never litters the player DB with
#       throwaway rows. If the password is ever rotated, update
#       both here and on the registered account.
#       Defaults: smoketest@dispatchhq.game / SmokeTest2026!
#   SMOKE_ALERT_URL
#       Optional webhook (Slack/Discord/ntfy-style) that receives
#       a JSON payload whenever the probe fails.
#   SMOKE_STATE_FILE
#       Where --no-litter stores the known account id (default:
#       $HOME/.cache/dhq-smoke-<base-url-host>.id). Delete it only
#       to deliberately reset the guard.
#
# Scheduling:
#   * GitHub Actions (ready when the repo is pushed to GitHub):
#       .github/workflows/save-health.yml — every 2 hours
#   * Cron on the Zo instance (current setup):
#       0 */2 * * * SMOKE_ALERT_URL=... bash \
#         /home/workspace/Projects/dispatch-hq/scripts/smoke-test.sh \
#         --no-litter >> /tmp/dhq-smoke.log 2>&1
# ============================================================
set -uo pipefail

BASE_URL="https://dispatch-hq-deandrewharris.zocomputer.io"
EXPECT_VERSION=""
NO_LITTER=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --expect-version) EXPECT_VERSION="${2:-}"; shift 2 ;;
    --no-litter) NO_LITTER=1; shift ;;
    *) BASE_URL="${1%/}"; shift ;;
  esac
done

SMOKE_EMAIL="${SMOKE_EMAIL:-smoketest@dispatchhq.game}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-SmokeTest2026!}"
SMOKE_ALERT_URL="${SMOKE_ALERT_URL:-}"
# State file for --no-litter: per base-url so multiple environments never clash.
SMOKE_STATE_FILE="${SMOKE_STATE_FILE:-}"
if [[ -z "$SMOKE_STATE_FILE" ]]; then
  SMOKE_HOST="$(printf '%s' "$BASE_URL" | sed -E 's#https?://##; s#[^A-Za-z0-9]#_#g')"
  SMOKE_STATE_FILE="${HOME}/.cache/dhq-smoke-${SMOKE_HOST}.id"
fi

JAR_DIR="$(mktemp -d)"
JAR="$JAR_DIR/cookies.txt"
trap 'rm -rf "$JAR_DIR"' EXIT

PASS=0
FAIL=0
FAIL_MSG=""
VERSION=""

ok()  { printf '  ✓ %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  ✗ %s\n' "$*"; FAIL=$((FAIL + 1)); FAIL_MSG="$*"; }

# api METHOD PATH [JSON_BODY] -> "body\n@@HTTP@@code"
api() {
  local method="$1" path="$2" body="${3:-}"
  local out
  if [[ -n "$body" ]]; then
    out="$(curl -s -m 40 -c "$JAR" -b "$JAR" -X "$method" \
      -H 'Content-Type: application/json' -d "$body" \
      -w $'\n@@HTTP@@%{http_code}' "$BASE_URL$path")" || return 1
  else
    out="$(curl -s -m 40 -c "$JAR" -b "$JAR" -X "$method" \
      -w $'\n@@HTTP@@%{http_code}' "$BASE_URL$path")" || return 1
  fi
  printf '%s\n' "$out"
}

# jval 'JSON' 'python-expression' -> value or <missing>
jval() {
  python3 - "$1" "$2" <<'PY' 2>/dev/null || printf '%s\n' '<missing>'
import json, sys
try:
    d = json.loads(sys.argv[1])
    v = eval(sys.argv[2], {"d": d})
    print("" if v is None else v)
except Exception:
    print("<missing>")
PY
}

alert_failure() {
  [[ -n "$SMOKE_ALERT_URL" ]] || return 0
  local payload
  payload="$(python3 -c 'import json,sys; print(json.dumps({"service":"Dispatch HQ","check":"save-health","status":"fail","detail":sys.argv[1],"baseUrl":sys.argv[2],"version":sys.argv[3]}))' "$FAIL_MSG" "$BASE_URL" "$VERSION" 2>/dev/null)" || return 0
  curl -s -m 20 -X POST -H 'Content-Type: application/json' \
    -d "$payload" "$SMOKE_ALERT_URL" >/dev/null 2>&1 || true
  printf '  → failure alert sent to SMOKE_ALERT_URL\n'
}

printf '=== Dispatch HQ save-health smoke test ===\n'
printf 'target : %s\n' "$BASE_URL"
printf 'time   : %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'account: %s\n\n' "$SMOKE_EMAIL"

# --- 1. /health -------------------------------------------------
printf '1. /health\n'
out="$(api GET /health)"
body="${out%@@HTTP@@*}"
code="${out##*@@HTTP@@}"
if [[ "$code" == "200" ]]; then
  status="$(jval "$body" 'd.get("status")')"
  VERSION="$(jval "$body" 'd.get("version")')"
  if [[ "$status" == "ok" ]]; then
    ok "/health ok (v$VERSION)"
  else
    bad "/health status is '$status'"
  fi
  if [[ -n "$EXPECT_VERSION" && "$VERSION" != "$EXPECT_VERSION" ]]; then
    bad "version '$VERSION' != expected '$EXPECT_VERSION'"
  else
    ok "version check${EXPECT_VERSION:+ (=$EXPECT_VERSION)}"
  fi
else
  bad "/health returned HTTP $code"
fi

# --- 2. authenticate (login → register on first run) ------------
printf '\n2. authenticate'
[[ "$NO_LITTER" -eq 1 ]] && printf ' (--no-litter guard active)'
printf '\n'
KNOWN=""
[[ "$NO_LITTER" -eq 1 && -f "$SMOKE_STATE_FILE" ]] && KNOWN="$(cat "$SMOKE_STATE_FILE" 2>/dev/null || true)"
PLAYER_ID=""
out="$(api POST /api/auth/login "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}")"
body="${out%@@HTTP@@*}"
code="${out##*@@HTTP@@}"
if [[ "$code" == "200" ]]; then
  PLAYER_ID="$(jval "$body" 'd.get("player", {}).get("id")')"
  ok "login ok ($SMOKE_EMAIL)"
else
  if [[ "$NO_LITTER" -eq 1 && -n "$KNOWN" ]]; then
    bad "login failed but smoke id $KNOWN is on record — refusing to register a replacement account (fix SMOKE_EMAIL/SMOKE_PASSWORD, or delete $SMOKE_STATE_FILE to start fresh)"
  else
    out="$(api POST /api/auth/register "{\"username\":\"dhq_smoke_bot\",\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}")"
    body="${out%@@HTTP@@*}"
    code="${out##*@@HTTP@@}"
    if [[ "$code" == "201" ]]; then
      PLAYER_ID="$(jval "$body" 'd.get("player", {}).get("id")')"
      ok "registered persistent smoke account"
    elif [[ "$code" == "409" ]]; then
      bad "login failed AND email exists — SMOKE_PASSWORD changed since the account was created?"
    else
      bad "auth failed (HTTP $code): $body"
    fi
  fi
fi

# --no-litter guard: bind the probe to exactly one account.
if [[ "$NO_LITTER" -eq 1 && -n "$PLAYER_ID" ]]; then
  if [[ -n "$KNOWN" && "$KNOWN" != "$PLAYER_ID" ]]; then
    bad "--no-litter: authenticated as $PLAYER_ID but the recorded smoke id is $KNOWN — SMOKE_EMAIL likely changed; aborting before any data is written"
  elif [[ -z "$KNOWN" ]]; then
    mkdir -p "$(dirname "$SMOKE_STATE_FILE")" 2>/dev/null || true
    if printf '%s\n' "$PLAYER_ID" > "$SMOKE_STATE_FILE" 2>/dev/null; then
      ok "recorded smoke account id $PLAYER_ID"
    else
      bad "could not write state file $SMOKE_STATE_FILE"
    fi
  fi
fi

# Never write save data when auth or the guard failed.
if [[ "$FAIL" -gt 0 ]]; then
  printf '\nABORTED — auth/litter guard failed; skipping the save round-trip\n'
  printf 'SMOKE_FAIL — %d checks failed\n' "$FAIL"
  alert_failure
  exit 1
fi

# --- 3. numeric-slot save (regression for the sanitizeSlot crash) ---
printf '\n3. numeric-slot save (regression: slot.trim TypeError)\n'
PAYLOAD='{"slot": 1, "data": {"player": {"level": 7, "credits": 1234, "xp": 42}, "selectedCity": {"name": "Smoke City"}, "career": {"missionsCompleted": 9}, "gameMinutes": 60}}'
out="$(api POST /api/player/saves "$PAYLOAD")"
body="${out%@@HTTP@@*}"
code="${out##*@@HTTP@@}"
saved_slot="$(jval "$body" 'd.get("slot")')"
if [[ "$code" == "200" && "$saved_slot" == "1" ]]; then
  ok 'save accepted, numeric slot coerced to "1"'
else
  bad "save failed (HTTP $code, slot='$saved_slot'): $body"
fi

# --- 4. list shows the slot --------------------------------------
printf '\n4. list saves\n'
out="$(api GET /api/player/saves)"
body="${out%@@HTTP@@*}"
code="${out##*@@HTTP@@}"
listed="$(jval "$body" 'any(s.get("slot") == "1" for s in d.get("saves", []))')"
if [[ "$code" == "200" && "$listed" == "True" ]]; then
  ok 'slot "1" present in save list'
else
  bad "slot \"1\" missing from save list (HTTP $code)"
fi

# --- 5. load round-trip ------------------------------------------
printf '\n5. load round-trip\n'
out="$(api GET /api/player/saves/1)"
body="${out%@@HTTP@@*}"
code="${out##*@@HTTP@@}"
level="$(jval "$body" 'd.get("data", {}).get("player", {}).get("level")')"
if [[ "$code" == "200" && "$level" == "7" ]]; then
  ok 'loaded save intact (level 7)'
else
  bad "load failed (HTTP $code, level='$level'): $body"
fi

# --- 6. cleanup (best-effort — does not fail the probe) ----------
printf '\n6. cleanup\n'
out="$(api DELETE /api/player/saves/1)"
code="${out##*@@HTTP@@}"
if [[ "$code" == "200" ]]; then
  ok 'test save removed'
else
  printf '  (warn) could not remove test save (HTTP %s) — it will be overwritten next run\n' "$code"
fi

# --- result -------------------------------------------------------
printf '\n'
if [[ "$FAIL" -eq 0 ]]; then
  printf 'SMOKE_OK — %d checks passed (v%s)\n' "$PASS" "$VERSION"
  exit 0
fi
printf 'SMOKE_FAIL — %d checks failed\n' "$FAIL"
alert_failure
exit 1
