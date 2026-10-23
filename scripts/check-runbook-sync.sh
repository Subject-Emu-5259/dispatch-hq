#!/usr/bin/env bash
# ============================================================
# check-runbook-sync.sh — runbook ↔ code contract (config.ts guards + the
# external-host gate)
#
# Contract 1 — plans/RELEASES.md ↔ servers/game-server/src/config.ts on the
# three boot-guard behaviors (JWT_SECRET hard stop, DATABASE_URL hard stop,
# REDIS_URL loud warning).
# Contract 2 — plans/RELEASES.md §2.5 item 6 ↔ scripts/check-external-hosts.sh
# on the zero-third-party gate: its behavior strings must be documented, and
# every allowlisted host must be NAMED in the runbook (Side G).
# The runbook is a live ops document and the code implements the behavior —
# when one changes and the other doesn't, the next operator reads a lie. This
# check fails the build so the lie never merges.
#
#   Side A — code behavior MUST be documented (anti-stale-runbook).
#     Every FRAGMENT below must appear literally in BOTH files. A fragment
#     missing from the runbook means the runbook lagged behind a code change
#     → fail. A fragment missing from config.ts means THIS script's contract
#     is stale (the guard was renamed/removed) → fail, with instructions to
#     update the script itself before the runbook.
#
#   Side B — obsolete behavior MUST NOT be documented as current.
#     config.ts no longer falls back to the dev credentials — it refuses to
#     start (JWT/DATABASE_URL) or warns loudly (REDIS_URL). If the runbook
#     ever claims the old silent-fallback behavior as present tense (e.g.
#     "config.ts falls back to the dev secret"), fail. Historical statements
#     about the pre-guard era are allowed ONLY when the same line carries a
#     historical qualifier (pre-v0.22, no longer supported, previous state,
#     used to, formerly, prior to, last documented, legacy) — the runbook
#     must always read as documenting the past, never the present.
#
# Run:  bash scripts/check-runbook-sync.sh [--self-test] [RUNBOOK] [CONFIG] [GATE]
#       (optional RUNBOOK/CONFIG/GATE paths let you test the contract against
#        modified copies without touching the real files)
# Exit: 0 = in sync · 1 = contract violation or self-test failure
#
# Pure bash + grep, no dependencies — the CI job needs no install step.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNBOOK_DEFAULT="$ROOT/plans/RELEASES.md"
CONFIG_DEFAULT="$ROOT/servers/game-server/src/config.ts"
GATE_DEFAULT="$ROOT/scripts/check-external-hosts.sh"

# ---------------------------------------------------------------------------
# The contract. Each fragment must exist verbatim in BOTH files — update this
# list the moment a guard message or escape hatch changes in config.ts, then
# make the runbook match.
# ---------------------------------------------------------------------------
FRAGMENTS=(
  'JWT_SECRET is missing, empty, or still the dev fallback'
  'DATABASE_URL is missing, empty, or still the local-dev fallback'
  'REDIS_URL is missing, empty, or still the local-dev fallback'
  'ALLOW_DEV_JWT_SECRET'
  'ALLOW_DEV_DATABASE_URL'
  'ALLOW_DEV_REDIS_URL'
)

# ---------------------------------------------------------------------------
# Side G — the external-host gate (v0.23.2) must not drift from the runbook.
# GATE_FRAGMENTS: behavior strings the gate script actually emits; each must
# exist verbatim in BOTH the gate script and plans/RELEASES.md §2.5 item 6.
# Allowlist parity: every host allowlisted in the gate script must be NAMED in
# the runbook — an allowlist change is a deliberate decision that must be
# recorded, so the runbook cannot silently lag a new (or removed) exception.
# ---------------------------------------------------------------------------
GATE_FRAGMENTS=(
  'zero-third-party'
  'no unapproved external hosts in the web sources'
  'unapproved external host(s)'
)

# Obsolete-behavior phrases: claims of a silent dev-fallback that config.ts
# has refused to perform since v0.22.18/v0.22.19. A line containing one of
# these must be a QUALIFIED historical statement (see QUALIFIER_RE below).
FORBIDDEN=(
  'falls back to the dev secret'
  'falls back to the dev fallback'
  'falls back to the local-dev fallback'
  'falls back to the dev database'
  'silently falls back to'
  'silently using the committed fallback'
  'silently booting the committed dev fallback'
)

# Historical qualifiers that mark a sentence as describing the pre-guard era.
QUALIFIER_RE='pre-v0\.22|no longer supported|no longer|previous state|previous|used to|formerly|prior to|last documented|legacy'

check_contract() {
  local runbook="$1" config="$2" fail=0 f line pat

  # --- Side A: every fragment in both files --------------------------------
  for f in "${FRAGMENTS[@]}"; do
    if ! grep -qF -- "$f" "$config"; then
      printf 'FAIL [A] contract is stale: config.ts no longer contains the fragment this script asserts:\n         "%s"\n         Update FRAGMENTS in scripts/check-runbook-sync.sh to match the current guard, then update the runbook.\n' "$f"
      fail=1
    fi
    if ! grep -qF -- "$f" "$runbook"; then
      printf 'FAIL [A] runbook is stale: plans/RELEASES.md does not document a startup behavior config.ts implements:\n         "%s"\n         Document it in plans/RELEASES.md (§0a JWT / §0a2 data stores) and keep the wording in sync.\n' "$f"
      fail=1
    fi
  done

  # --- Side B: no obsolete behavior claimed as current ---------------------
  pat="$(IFS='|'; printf '%s' "${FORBIDDEN[*]}")"
  while IFS= read -r line; do
    if grep -Eq "$QUALIFIER_RE" <<< "$line"; then
      continue  # historical statement, explicitly qualified — allowed
    fi
    printf 'FAIL [B] runbook claims a startup behavior config.ts no longer has, with no historical qualifier on the line (e.g. "falls back to the dev secret" is obsolete — config.ts now throws at boot):\n         %s\n' "$line"
    fail=1
  done < <(grep -nE "$pat" "$runbook" || true)

  return "$fail"
}

hosts_from_gate() { # $1 = gate script; prints the allowlisted hosts (the ALLOWLIST block)
  awk '/^ALLOWLIST="/{f=1; next} f && /^[[:space:]]*"$/{f=0} f && /^[a-z0-9.-]+$/{print}' "$1"
}

check_gate_contract() { # $1 = runbook, $2 = gate script. rc 1 on any drift.
  local runbook="$1" gate="$2" fail=0 f host
  if [[ ! -f "$gate" ]]; then
    printf 'FAIL [G] gate script missing: %s\n' "$gate"
    return 1
  fi
  for f in "${GATE_FRAGMENTS[@]}"; do
    if ! grep -qF -- "$f" "$gate"; then
      printf 'FAIL [G] contract is stale: check-external-hosts.sh no longer contains the fragment this script asserts:\n         "%s"\n         Update GATE_FRAGMENTS in scripts/check-runbook-sync.sh, then update the runbook.\n' "$f"
      fail=1
    fi
    if ! grep -qF -- "$f" "$runbook"; then
      printf 'FAIL [G] runbook is stale: plans/RELEASES.md §2.5 item 6 does not document the external-host gate behavior:\n         "%s"\n         Document it and keep the wording in sync with scripts/check-external-hosts.sh.\n' "$f"
      fail=1
    fi
  done
  while IFS= read -r host; do
    [[ -n "$host" ]] || continue
    if ! grep -qF -- "$host" "$runbook"; then
      printf 'FAIL [G] allowlist drift: check-external-hosts.sh allowlists "%s" but plans/RELEASES.md never names it.\n         Document every allowlisted host in §2.5 item 6 — an allowlist change is a deliberate decision that must be recorded.\n' "$host"
      fail=1
    fi
  done < <(hosts_from_gate "$gate")
  return "$fail"
}

# ---------------------------------------------------------------------------
# Self-test: prove both directions actually FAIL when they should and PASS
# when they should, using throwaway fixtures. Run by CI before the real check
# so a regression in the check itself (e.g. a fragment typo) can never make it
# green-on-broken.
# ---------------------------------------------------------------------------
self_test() {
  local tmp fail=0 rc
  tmp="$(mktemp -d)"
  # Guard the reference: the RETURN trap fires after `local tmp` is cleared, so
  # an unguarded "$tmp" would itself abort under `set -u` and corrupt the exit
  # status of an otherwise-passing self-test.
  trap '[[ -n "${tmp:-}" ]] && rm -rf "$tmp"' RETURN

  cat > "$tmp/config.ts" <<'EOF'
// fixture config.ts — carries every contract fragment
export const DEV_JWT_FALLBACK = 'dev-secret-change-in-production';
export const DEV_DATABASE_FALLBACK = 'postgresql://dispatch:dispatch_dev_2026@localhost:5432/dispatch_hq';
export const DEV_REDIS_FALLBACK = 'redis://localhost:6379';
// [dispatch-hq] FATAL: JWT_SECRET is missing, empty, or still the dev fallback
// [dispatch-hq] FATAL: DATABASE_URL is missing, empty, or still the local-dev fallback
// [dispatch-hq] WARNING: REDIS_URL is missing, empty, or still the local-dev fallback
// escape hatches: ALLOW_DEV_JWT_SECRET / ALLOW_DEV_DATABASE_URL / ALLOW_DEV_REDIS_URL
EOF

  cat > "$tmp/RELEASES.md" <<'EOF'
# Dispatch HQ runbook (fixture)

- config.ts throws FATAL: JWT_SECRET is missing, empty, or still the dev fallback
- config.ts throws FATAL: DATABASE_URL is missing, empty, or still the local-dev fallback
- config.ts warns: REDIS_URL is missing, empty, or still the local-dev fallback
- escape hatches: ALLOW_DEV_JWT_SECRET, ALLOW_DEV_DATABASE_URL, ALLOW_DEV_REDIS_URL
EOF

  local expect got desc
  run_case() {  # run_case <expected> <description> <runbook> <config>
    (check_contract "$3" "$4" >/dev/null 2>&1)
    got=$?
    if [[ "$got" -eq "$1" ]]; then
      printf '  ok   — %s (rc %s)\n' "$2" "$got"
    else
      printf '  FAIL — %s: expected rc %s, got %s\n' "$2" "$1" "$got"
      fail=1
    fi
  }

  echo 'Self-test:'
  run_case 0 'baseline in sync' "$tmp/RELEASES.md" "$tmp/config.ts"

  # Case 2 — runbook drops a documented fragment → Side A fail
  grep -v 'ALLOW_DEV_REDIS_URL' "$tmp/RELEASES.md" > "$tmp/rb-drop.md"
  run_case 1 'runbook missing a fragment fails' "$tmp/rb-drop.md" "$tmp/config.ts"

  # Case 3 — config.ts loses a guard → stale contract fail (Side A)
  grep -v 'DATABASE_URL is missing, empty' "$tmp/config.ts" > "$tmp/cfg-drop.ts"
  run_case 1 'config.ts missing a fragment fails' "$tmp/RELEASES.md" "$tmp/cfg-drop.ts"

  # Case 4 — obsolete behavior claimed unqualified → Side B fail
  cat >> "$tmp/RELEASES.md" <<'EOF'
- config.ts falls back to the dev secret when JWT_SECRET is unset
EOF
  run_case 1 'unqualified obsolete claim fails' "$tmp/RELEASES.md" "$tmp/config.ts"

  # Case 5 — same claim, historically qualified → allowed
  cat > "$tmp/rb-hist.md" <<'EOF'
# Dispatch HQ runbook (fixture)
- config.ts throws FATAL: JWT_SECRET is missing, empty, or still the dev fallback
- config.ts throws FATAL: DATABASE_URL is missing, empty, or still the local-dev fallback
- config.ts warns: REDIS_URL is missing, empty, or still the local-dev fallback
- escape hatches: ALLOW_DEV_JWT_SECRET, ALLOW_DEV_DATABASE_URL, ALLOW_DEV_REDIS_URL
- The pre-v0.22.18 era silently using the committed fallback is no longer supported
EOF
  run_case 0 'historically qualified claim passes' "$tmp/rb-hist.md" "$tmp/config.ts"

  # --- Side G: external-host gate contract (v0.23.2) ------------------------
  cat > "$tmp/check-external-hosts.sh" <<'EOF'
#!/usr/bin/env bash
# the zero-third-party release gate
ALLOWLIST="
# main-menu social buttons (user-clicked href navigations, never page-loaded)
www.facebook.com
www.reddit.com
"
echo 'no unapproved external hosts in the web sources'
echo 'unapproved external host(s)'
EOF
  cat > "$tmp/gate-runbook.md" <<'EOF'
# Dispatch HQ runbook (fixture) — gate contract
- External-host gate: zero-third-party; prints `no unapproved external hosts in the web sources`; refuses on an `unapproved external host(s)`.
- Allowlisted hosts: www.facebook.com, www.reddit.com
EOF

  run_gate_case() {  # run_gate_case <expected> <description> <runbook> <gate>
    (check_gate_contract "$3" "$4" >/dev/null 2>&1)
    got=$?
    if [[ "$got" -eq "$1" ]]; then
      printf '  ok   — %s (rc %s)\n' "$2" "$got"
    else
      printf '  FAIL — %s: expected rc %s, got %s\n' "$2" "$1" "$got"
      fail=1
    fi
  }

  echo 'Gate self-test:'
  run_gate_case 0 'gate baseline in sync' "$tmp/gate-runbook.md" "$tmp/check-external-hosts.sh"

  # Case G2 — a new host added to the allowlist but not the runbook → drift fail
  sed 's|www.reddit.com|www.reddit.com\ncdn.example-new.com|' "$tmp/check-external-hosts.sh" > "$tmp/gate2.sh"
  run_gate_case 1 'new allowlisted host not documented fails' "$tmp/gate-runbook.md" "$tmp/gate2.sh"

  # Case G3 — runbook drops a gate fragment → Side A fail
  grep -v 'unapproved external host(s)' "$tmp/gate-runbook.md" > "$tmp/gate3.md"
  run_gate_case 1 'runbook missing gate fragment fails' "$tmp/gate3.md" "$tmp/check-external-hosts.sh"

  if [[ "$fail" -ne 0 ]]; then
    echo 'Self-test: FAILED'
    return 1
  fi
  echo 'Self-test: all cases passed'
  return 0
}

# ---------------------------------------------------------------------------
main() {
  if [[ "${1:-}" == "--self-test" ]]; then
    self_test
    return $?
  fi
  local runbook="${1:-$RUNBOOK_DEFAULT}" config="${2:-$CONFIG_DEFAULT}" gate="${3:-$GATE_DEFAULT}" rc=0
  check_contract "$runbook" "$config" || rc=1
  check_gate_contract "$runbook" "$gate" || rc=1
  return $rc
}

main "$@"
