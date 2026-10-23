#!/usr/bin/env bash
# ============================================================
# test-deploy-gate.sh — drift-gate regression matrix for scripts/deploy.sh
#
# CI (deploy-gate.yml) runs this on every change to scripts/deploy.sh so the
# pre-upload drift gate (deploy.sh section 0.7) cannot regress silently. It
# builds a throwaway sandbox that mirrors the minimal repo layout deploy.sh
# reads, copies the REAL deploy.sh into it, and exercises each failure class
# the gate was built for — plus a positive control and ver_gt() units.
# Fully offline except case H, which uses a local stub /health server.
#
# Matrix:
#   U — ver_gt() semver unit checks (equal / less / greater / cross-tens)
#   P — positive control: note leads VERSION, constants match, web files
#       shipped → deploy proceeds (--dry-run, exit 0, SW gate fires)
#   A — release note leads an OLDER version than VERSION → fail loudly
#   B — web release whose tarball omits releaseNotes.ts → fail loudly
#   D — server version constant != VERSION → fail loudly
#   S1 — web release omitting the server files from the tarball, constants
#       matching → deploy proceeds and auto-adds them (so /health ships
#       VERSION; the v0.22.4 fix)
#   S2 — web release omitting the server files AND constants stale → fail
#       loudly BEFORE upload (the old gate skipped this class entirely)
#   H — live /health already reports a NEWER version → fail loudly
#   T — tarball-completeness: a requested path that is NOT a regular file on
#       disk (nonexistent / directory — the v0.21.1 dropped-file class)
#       → fail loudly before the tarball is even built
#   Z — classify_zo_response() units (v0.22.7): the §8 retry gate's response
#       classifier — real output accepted, the intermittent 401 "Not enough
#       segments" treated as a swallow class (not a hard stop), 303/empty and
#       other bodies classified — so the swallow classes can't regress either.
#   K — instance data-store pre-flight embedded (v0.22.19): the generated
#       instance script must carry the DATABASE_URL refusal (missing/empty/
#       dev-fallback) and the REDIS_URL warning, so a regression can't strip
#       the "wrong database" gate from the deploy script.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$ROOT/scripts/deploy.sh"
[[ -f "$DEPLOY" ]] || { echo "FATAL: $DEPLOY not found" >&2; exit 2; }

PASS=0
FAIL=0
FAILED_CASES=()

say()  { printf '%s\n' "$*"; }
pass() { PASS=$((PASS+1)); say "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); FAILED_CASES+=("$1"); say "  ✗ $1"; }

# --- U. ver_gt unit checks (extract the real function from deploy.sh) ---
say "U. ver_gt() semver comparison"
eval "$(sed -n '/^ver_gt()/,/^}/p' "$DEPLOY")"
u_assert() { # name, expected rc (0/1), then command args
  local name="$1" want="$2"; shift 2
  local got=0; "$@" || got=$?
  if [[ "$got" -eq "$want" ]]; then pass "$name"; else fail "$name (expected rc $want, got $got)"; fi
}
u_assert "0.19.7 vs 0.19.7 → equal, not greater"               1 ver_gt 0.19.7 0.19.7
u_assert "0.19.7 vs 0.19.6 → greater"                          0 ver_gt 0.19.7 0.19.6
u_assert "0.19.6 vs 0.19.7 → not greater"                      1 ver_gt 0.19.6 0.19.7
u_assert "0.20.0 vs 0.19.7 → greater (cross-tens)"             0 ver_gt 0.20.0 0.19.7
u_assert "0.19.7 vs 0.20.0 → not greater (cross-tens)"         1 ver_gt 0.19.7 0.20.0

# --- sandbox: minimal repo layout deploy.sh reads ---
SANDBOX="$(mktemp -d /tmp/dhq-gate.XXXXXX)"
STUB_PID=""
trap 'rm -rf "$SANDBOX"; [[ -n "$STUB_PID" ]] && kill "$STUB_PID" 2>/dev/null || true' EXIT
mkdir -p "$SANDBOX/scripts" "$SANDBOX/apps/web/src/data" "$SANDBOX/apps/web/public" "$SANDBOX/servers/game-server/src/config"
cp "$DEPLOY" "$SANDBOX/scripts/deploy.sh"
# The external-host gate (v0.23.2) lives in its own script that deploy.sh calls —
# the sandbox must carry it or every web case fails at script generation.
cp "$ROOT/scripts/check-external-hosts.sh" "$SANDBOX/scripts/check-external-hosts.sh"
# deploy.sh extracts the dev-fallback sentinels from the REAL constants
# (single source of truth — servers/game-server/src/config), so the sandbox
# must carry them or every case that reaches script generation fails.
cp "$ROOT/servers/game-server/src/config.ts" "$SANDBOX/servers/game-server/src/config.ts"
cp "$ROOT/servers/game-server/src/config/devFallbacks.ts" "$SANDBOX/servers/game-server/src/config/devFallbacks.ts"

# scenario file writers (regenerated per case)
write_note() { # $1 = leading release-note version; version on its OWN line, exactly
  # like the real file — the gate's awk strips non-[0-9.] per line, so a
  # same-line date would leak into the parsed version (0.19.720260811).
  cat > "$SANDBOX/apps/web/src/data/releaseNotes.ts" <<EOF
export const RELEASE_NOTES = [
  {
    version: '$1',
    date: '2026-08-11',
    title: 'x',
    items: ['y'],
  },
  {
    version: '0.19.6',
    date: '2026-08-11',
    title: 'x',
    items: ['y'],
  },
];
EOF
}
write_constants() { # $1 = server version constant
  for f in index.ts serve-combined.ts; do
    cat > "$SANDBOX/servers/game-server/src/$f" <<EOF
export const serverInfo = { game: 'Dispatch HQ', version: '$1' };
EOF
  done
}
write_sw() {
  cat > "$SANDBOX/apps/web/public/service-worker.js" <<'EOF'
const CACHE_NAME = 'dispatch-hq-v10';
EOF
}

run_deploy() { # name, expected rc, expected message (grep -E, may be ''), then deploy.sh args
  local name="$1" want_rc="$2" want_msg="$3"; shift 3
  local log; log="$(mktemp)"
  local rc=0
  (cd "$SANDBOX" && bash scripts/deploy.sh "$@") >"$log" 2>&1 || rc=$?
  if [[ "$rc" -ne "$want_rc" ]]; then
    fail "$name (expected rc $want_rc, got $rc)"
    sed 's/^/    | /' "$log" | tail -10
    rm -f "$log"; return
  fi
  if [[ -n "$want_msg" ]] && ! grep -qE "$want_msg" "$log"; then
    fail "$name (rc ok but missing message: $want_msg)"
    sed 's/^/    | /' "$log" | tail -10
    rm -f "$log"; return
  fi
  pass "$name"
  rm -f "$log"
}

WEB_FILES=(apps/web/src/data/releaseNotes.ts servers/game-server/src/index.ts servers/game-server/src/serve-combined.ts)

# --- P. positive control (dry-run) ---
say "P. positive control"
write_note 0.19.7; write_constants 0.19.7; write_sw
run_deploy "matching note+constants+web → passes, SW gate fires" 0 \
  "✓ release note leads with v0.19.7|SW CACHE GATE" \
  0.19.7 "${WEB_FILES[@]}" --dry-run

# --- A. release note leads an older version ---
say "A. release-note drift"
write_note 0.19.6; write_constants 0.19.7; write_sw
run_deploy "note leads v0.19.6 while deploying v0.19.7 → fails" 1 \
  "leads with v0.19.6" \
  0.19.7 "${WEB_FILES[@]}" --dry-run

# --- B. web release omits releaseNotes.ts from the tarball ---
# Must include at least one apps/web/* file (so WEB_TOUCHED=1) but NOT the
# release note — the SW gate will auto-add the SW file, keeping the release web.
say "B. missing release note from tarball"
write_note 0.19.7; write_constants 0.19.7; write_sw
run_deploy "web release without releaseNotes.ts in tarball → fails" 1 \
  "not in the transfer tarball" \
  0.19.7 apps/web/public/service-worker.js servers/game-server/src/index.ts servers/game-server/src/serve-combined.ts --dry-run

# --- D. server constant mismatch ---
say "D. server constant drift"
write_note 0.19.7; write_constants 0.19.6; write_sw
run_deploy "constant reports v0.19.6 while deploying v0.19.7 → fails" 1 \
  "reports v0.19.6" \
  0.19.7 "${WEB_FILES[@]}" --dry-run

# --- S1. web-only release, server files omitted from the tarball ---
# Constants match VERSION; the server files are NOT in <file...>. The gate must
# pass and auto-add both so the running instance serves the new /health.
say "S1. server files omitted but constants bumped → auto-added"
write_note 0.19.7; write_constants 0.19.7; write_sw
run_deploy "web-only tarball → server files auto-added, deploy proceeds" 0 \
  "auto-added to the transfer tarball \(so /health serves v0.19.7\)" \
  0.19.7 apps/web/src/data/releaseNotes.ts apps/web/public/service-worker.js --dry-run

# --- S2. web-only release, server constants stale (the v0.22.4 class) ---
# The OLD gate skipped the constant check entirely when the server files were
# not in <file...>, so a release whose constants were never bumped shipped
# anyway and /health went stale after restart. Now it must fail BEFORE upload.
say "S2. server files omitted AND constants stale → fails before upload"
write_note 0.19.7; write_constants 0.19.6; write_sw
run_deploy "stale constants not in tarball → fails pre-upload" 1 \
  "reports v0.19.6" \
  0.19.7 apps/web/src/data/releaseNotes.ts apps/web/public/service-worker.js --dry-run

# --- E. external-host gate (v0.23.2): zero third-party enforcement ---
# The web sources may reference ONLY the allowlisted hosts. E1: clean sources
# pass. E2: a stray third-party host (accidental CDN/analytics) fails the
# deploy before upload.
say "E. external-host gate"
write_note 0.19.7; write_constants 0.19.7; write_sw
rm -f "$SANDBOX/apps/web/src/leak.ts"
run_deploy "clean web sources → external-host gate passes" 0 \
  "no unapproved external hosts" \
  0.19.7 "${WEB_FILES[@]}" --dry-run
write_note 0.19.7; write_constants 0.19.7; write_sw
printf '// accidental third-party dependency
const u = "https://cdn.evil-example.com/widget.js";\n' > "$SANDBOX/apps/web/src/leak.ts"
run_deploy "stray external host in web sources → fails pre-upload" 1 \
  "unapproved external host|cdn.evil-example.com" \
  0.19.7 "${WEB_FILES[@]}" --dry-run
rm -f "$SANDBOX/apps/web/src/leak.ts"

# --- T. tarball-completeness pre-flight (1.1 on-disk check) ---
say "T. tarball completeness"
write_note 0.19.7; write_constants 0.19.7; write_sw
run_deploy "nonexistent path in arg list → fails before tarball build" 1 \
  "is not a regular file on disk" \
  0.19.7 apps/web/src/App.tsx "${WEB_FILES[@]}" --dry-run
run_deploy "directory path in arg list → fails before tarball build" 1 \
  "is not a regular file on disk" \
  0.19.7 apps/web/src/data "${WEB_FILES[@]}" --dry-run

# --- H. live downgrade guard (local stub /health, non-dry-run) ---
say "H. live downgrade guard"
write_note 0.19.7; write_constants 0.19.7; write_sw
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
python3 - "$PORT" <<'PY' &
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
port = int(sys.argv[1])
body = b'{"status":"ok","game":"Dispatch HQ","version":"0.20.0"}'
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()
    def log_message(self, *a):
        pass
HTTPServer(('127.0.0.1', port), H).serve_forever()
PY
STUB_PID=$!
sleep 1
DHQ_LIVE_URL="http://127.0.0.1:$PORT" run_deploy "live reports v0.20.0 while deploying v0.19.7 → fails before upload" 1 \
  "already reports v0.20.0" \
  0.19.7 "${WEB_FILES[@]}"
kill "$STUB_PID" 2>/dev/null || true
wait "$STUB_PID" 2>/dev/null || true   # reap quietly — no "Terminated:" job noise
STUB_PID=""

# --- Z. Zo API response classifier (the v0.22.7 401 swallow class) ---
# Extracted straight from deploy.sh §8, like ver_gt above. Only a non-empty
# JSON body carrying "output" counts as a real response; 401 "Not enough
# segments" must be classified as a retryable swallow class, never a hard stop.
say "Z. classify_zo_response() — Zo API swallow classes"
eval "$(sed -n '/^classify_zo_response()/,/^}/p' "$DEPLOY")"
ZDIR="$(mktemp -d /tmp/dhq-zo.XXXXXX)"
z_assert() { # name, expected class, http code, body file
  local name="$1" want="$2" code="$3" bf="$4"
  local got; got="$(classify_zo_response "$code" "$bf")"
  if [[ "$got" == "$want" ]]; then pass "$name"; else fail "$name (expected '$want', got '$got')"; fi
}
printf '%s' '{"output":"deploy ok"}' > "$ZDIR/real.json"
printf '%s' '{"error":"Not enough segments"}' > "$ZDIR/401.json"
printf '%s' 'Not enough segments' > "$ZDIR/401.txt"
printf '%s' '{"error":"who knows"}' > "$ZDIR/500.json"
: > "$ZDIR/empty.bin"
z_assert "real agent output → accepted"            real               200 "$ZDIR/real.json"
z_assert "401 JSON 'Not enough segments' → swallow class, not a stop" not-enough-segments 401 "$ZDIR/401.json"
z_assert "401 plain-text 'Not enough segments' → swallow class"      not-enough-segments 401 "$ZDIR/401.txt"
z_assert "401 with a real output payload still accepted"             real               401 "$ZDIR/real.json"
z_assert "303 empty → swallowed-303 (the v0.20.5 class)"             swallowed-303      303 "$ZDIR/empty.bin"
z_assert "empty 200 → swallowed-303 (the v0.20.5 class)"             swallowed-303      200 "$ZDIR/empty.bin"
z_assert "other non-real body → swallowed-other"                     swallowed-other     500 "$ZDIR/500.json"
rm -rf "$ZDIR"

# --- J. instance-side JWT pre-flight embedded (v0.22.17) ---
# The session-secret gate runs ON the instance during a real deploy (it reads
# the running service's /proc env), so it can't be exercised locally — but a
# regression could silently strip it from the generated instance script. Prove
# the generated script carries BOTH gates: the presence check (v0.17.5) and
# the new dev-fallback/empty VALUE gate (v0.22.17), plus its fail message.
say "J. instance JWT pre-flight embedded in generated deploy script"
write_note 0.19.7; write_constants 0.19.7; write_sw
run_deploy "positive dry-run (baseline for J)" 0 "" 0.19.7 "${WEB_FILES[@]}" --dry-run
GEN="$(ls -t /tmp/*-deploy.sh 2>/dev/null | head -1)"
# Sentinel derived from the single source of truth (deploy.sh does the same), so
# a credentials change never leaves this assertion asserting the old literal.
JWT_FB="$(sed -n "s/^export const DEV_JWT_FALLBACK = '\([^']*\)';$/\1/p" \
  "$ROOT/servers/game-server/src/config/devFallbacks.ts" | head -1)"
if [[ -n "$GEN" ]] \
  && grep -q 'JWT_SECRET is not pinned in the running service env' "$GEN" \
  && grep -qF "^JWT_SECRET=($JWT_FB)?$" "$GEN" \
  && grep -q 'still the DEV FALLBACK' "$GEN"; then
  pass "generated instance script carries presence + dev-fallback value gates"
else
  fail "generated instance script missing a JWT pre-flight gate ($GEN)"
fi

# --- K. instance data-store pre-flight embedded (v0.22.19) ---
# Same class as J: the DATABASE_URL refusal (missing/empty/fallback) and the
# REDIS_URL warning run ON the instance, so they can't be exercised locally —
# but a regression could silently strip them from the generated script. Prove
# both blocks made it in, plus the success marker and the REFUSAL semantics
# (DATABASE = exit 1 class, REDIS = warning-only).
say "K. instance DATABASE/REDIS pre-flight embedded in generated deploy script"
write_note 0.19.7; write_constants 0.19.7; write_sw
run_deploy "positive dry-run (baseline for K)" 0 "" 0.19.7 "${WEB_FILES[@]}" --dry-run
GEN="$(ls -t /tmp/*-deploy.sh 2>/dev/null | head -1)"
# Sentinel derived from the single source of truth (deploy.sh does the same), so
# a credentials change never leaves this assertion asserting the old literal.
DEV_DB="$(sed -n "s/^export const DEV_DATABASE_FALLBACK = '\([^']*\)';$/\1/p" \
  "$ROOT/servers/game-server/src/config/devFallbacks.ts" | head -1)"
if [[ -n "$GEN" ]] \
  && grep -q 'DATABASE_URL is not pinned in the running service env' "$GEN" \
  && grep -qF "^DATABASE_URL=($DEV_DB)?$" "$GEN" \
  && grep -q 'still the DEV FALLBACK (postgresql' "$GEN" \
  && grep -q 'REDIS_URL is missing or still the dev fallback' "$GEN" \
  && grep -q 'DATA_STORES_OK' "$GEN"; then
  pass "generated instance script carries DATABASE refusal + REDIS warning gates"
else
  fail "generated instance script missing a data-store pre-flight gate ($GEN)"
fi

# --- K2. dev-fallback extraction fails closed (v0.22.x) ---
# deploy.sh extracts the dev-fallback sentinels from
# src/config/devFallbacks.ts (single source of truth) instead of carrying its
# own copies of the literals. If that file is missing, the deploy must REFUSE
# to generate a script that couldn't recognize the dev credentials — never
# fail open with an empty sentinel.
say "K2. dev-fallback extraction fails closed when devFallbacks.ts is missing"
write_note 0.19.7; write_constants 0.19.7; write_sw
rm -f "$SANDBOX/servers/game-server/src/config/devFallbacks.ts"
run_deploy "missing devFallbacks.ts → refuses to generate the deploy script" 1 \
  "could not read the dev-fallback constants" \
  0.19.7 "${WEB_FILES[@]}" --dry-run

# --- L. behavioral pre-flight: the generated checks REFUSE, not just exist ---
# J/K proved the gates are EMBEDDED in the generated instance script; L proves
# they actually WORK by extracting check_service_env() from the GENERATED
# script (post-splice, exactly what the instance runs) and driving it with
# simulated service envs. Missing DATABASE_URL or holding the dev fallback →
# hard stop (exit 1); missing/fallback REDIS_URL → warning only (exit 0).
say "L. generated pre-flight behaves: refuses unpinned DB, warns on Redis"
# K2 deleted devFallbacks.ts from the shared sandbox — restore it for L.
cp "$ROOT/servers/game-server/src/config/devFallbacks.ts" "$SANDBOX/servers/game-server/src/config/devFallbacks.ts"
write_note 0.19.7; write_constants 0.19.7; write_sw
run_deploy "positive dry-run (baseline for L)" 0 "" 0.19.7 "${WEB_FILES[@]}" --dry-run
GEN="$(ls -t /tmp/*-deploy.sh 2>/dev/null | head -1)"
if [[ -z "$GEN" ]] || ! grep -q '^check_service_env()' "$GEN"; then
  fail "generated instance script missing check_service_env() ($GEN)"
else
  eval "$(sed -n '/^check_service_env()/,/^}/p' "$GEN")"
  DB_FB="$(sed -n "s/^export const DEV_DATABASE_FALLBACK = '\([^']*\)';$/\1/p" \
    "$ROOT/servers/game-server/src/config/devFallbacks.ts" | head -1)"
  REDIS_FB="$(sed -n "s/^export const DEV_REDIS_FALLBACK = '\([^']*\)';$/\1/p" \
    "$ROOT/servers/game-server/src/config/devFallbacks.ts" | head -1)"
  JWT_FB="$(sed -n "s/^export const DEV_JWT_FALLBACK = '\([^']*\)';$/\1/p" \
    "$ROOT/servers/game-server/src/config/devFallbacks.ts" | head -1)"

  env_check() { # name, env, want_rc, want_msg ('' = any)
    local name="$1" env="$2" want_rc="$3" want_msg="$4"
    local out rc=0
    out="$(check_service_env "$env" 2>&1)" || rc=$?
    if [[ "$rc" -ne "$want_rc" ]]; then
      fail "$name (expected rc $want_rc, got $rc)"
      printf '%s\n' "$out" | sed 's/^/    | /' | tail -4
      return
    fi
    if [[ -n "$want_msg" ]] && ! printf '%s\n' "$out" | grep -qF "$want_msg"; then
      fail "$name (rc ok but missing message: $want_msg)"
      printf '%s\n' "$out" | sed 's/^/    | /' | tail -4
      return
    fi
    pass "$name"
  }

  env_check "happy path — pinned JWT+DB+Redis → rc 0" \
    $'JWT_SECRET=real-secret\nDATABASE_URL=postgres://real/db\nREDIS_URL=redis://real:6379' \
    0 ''
  env_check "DATABASE_URL missing → hard stop (exit 1)" \
    $'JWT_SECRET=real-secret\nREDIS_URL=redis://real:6379' \
    1 'DATABASE_URL is not pinned'
  env_check "DATABASE_URL = dev fallback → hard stop (exit 1)" \
    "$(printf 'JWT_SECRET=real-secret\nDATABASE_URL=%s\nREDIS_URL=redis://real:6379' "$DB_FB")" \
    1 'still the DEV FALLBACK'
  env_check "REDIS_URL missing → warning only (exit 0)" \
    $'JWT_SECRET=real-secret\nDATABASE_URL=postgres://real/db' \
    0 'REDIS_URL is missing or still the dev fallback'
  env_check "REDIS_URL = dev fallback → warning only (exit 0)" \
    "$(printf 'JWT_SECRET=real-secret\nDATABASE_URL=postgres://real/db\nREDIS_URL=%s' "$REDIS_FB")" \
    0 'still the dev fallback'
  env_check "JWT_SECRET missing → hard stop (exit 1)" \
    $'DATABASE_URL=postgres://real/db\nREDIS_URL=redis://real:6379' \
    1 'JWT_SECRET is not pinned'
  env_check "JWT_SECRET = dev fallback → hard stop (exit 1)" \
    "$(printf 'JWT_SECRET=%s\nDATABASE_URL=postgres://real/db\nREDIS_URL=redis://real:6379' "$JWT_FB")" \
    1 'still the DEV FALLBACK'
fi

# --- summary ---
say ""
say "=== Result: $PASS passed, $FAIL failed ==="
if [[ "$FAIL" -gt 0 ]]; then
  say "Failed cases:"
  for c in "${FAILED_CASES[@]}"; do say "  - $c"; done
  exit 1
fi
say "Drift gate holds."
