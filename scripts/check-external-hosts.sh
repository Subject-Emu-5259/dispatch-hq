#!/usr/bin/env bash
# ============================================================
# check-external-hosts.sh — the zero-third-party release gate
#
# Fails the deploy if the web app references ANY external host that is not
# deliberately allowlisted below. "External host" = an http(s):// host in the
# shipped web sources (index.html, public/, src/ — test files excluded, since
# they never ship in the bundle).
#
# Why: v0.23.2 made the game zero-third-party (self-hosted fonts, tiles,
# routing, geocoding). This gate keeps it that way — an accidental CDN script,
# analytics snippet, or new third-party fetch in the web sources now fails the
# deploy BEFORE upload instead of silently shipping to production.
#
# Usage:
#   scripts/check-external-hosts.sh [repo-root]   # default: two dirs up from this script
#   scripts/check-external-hosts.sh --self-test   # fixture-prove both directions
# Exit codes: 0 clean, 1 unapproved external host(s) found, 2 error.
# ============================================================
set -euo pipefail

# Every host here is deliberately shipped. Add a new one ONLY as a conscious
# decision and record why next to it. Host only — scheme is stripped before
# matching. Lines starting with # are comments.
ALLOWLIST="
# The game's own origin (og:image / twitter:image meta tags in index.html).
dispatch-hq.onrender.com
# Main-menu social buttons (user-clicked href navigations, never page-loaded).
www.facebook.com
www.reddit.com
# v0.29.5: itch.io embed widget in the main menu (deliberate platform promo —
# an iframe the user opts into viewing; the game itself stays zero-dependency).
itch.io
agreatgame.itch.io
"

scan() { # $1 = web root. Prints every http(s):// host found (host only, sorted).
  local web="$1"
  # All shipped text sources under apps/web, excluding tests (never bundled).
  find "$web/src" "$web/public" -type f \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.html' -o -name '*.json' \) \
    ! -name '*.test.ts' ! -name '*.test.tsx' ! -name '*.spec.ts' ! -name '*.spec.tsx' \
    -print0 2>/dev/null | xargs -0 grep -hoE 'https?://[a-zA-Z0-9.-]+' 2>/dev/null \
    | sed -E 's#https?://##' | sort -u
  [[ -f "$web/index.html" ]] \
    && grep -hoE 'https?://[a-zA-Z0-9.-]+' "$web/index.html" 2>/dev/null \
    | sed -E 's#https?://##' | sort -u
}

unapproved() { # $1 = web root. Prints only hosts NOT in the allowlist; rc always 0.
  local web="$1" host
  while IFS= read -r host; do
    if [[ -n "$host" ]] && ! grep -qxF "$host" <<< "$ALLOWLIST"; then
      echo "$host"
    fi
  done < <(scan "$web")
  return 0
}

self_test() {
  local tmp rc=0
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  mkdir -p "$tmp/src" "$tmp/public"

  # 1) Clean: only allowlisted hosts → must pass.
  printf '// social\nconst s = { href: "https://www.reddit.com/r/DispatchHQ/" };\n' > "$tmp/src/a.ts"
  if unapproved "$tmp" | grep -q .; then
    echo "self-test FAIL: allowlisted hosts flagged" >&2; rc=1
  else
    echo "self-test ok: allowlisted hosts pass"
  fi

  # 2) Dirty: an unknown host → must fail.
  printf 'const u = "https://cdn.example-evil.com/widget.js";\n' > "$tmp/src/b.ts"
  if unapproved "$tmp" | grep -q 'cdn.example-evil.com'; then
    echo "self-test ok: unknown host flagged"
  else
    echo "self-test FAIL: unknown host not flagged" >&2; rc=1
  fi
  rm -f "$tmp/src/b.ts"

  # 3) Test-file exclusion: unknown host in a *.test.ts must NOT fail.
  printf 'const u = "https://api.mock.test/route";\n' > "$tmp/src/c.test.ts"
  if unapproved "$tmp" | grep -q 'api.mock.test'; then
    echo "self-test FAIL: test-file host flagged" >&2; rc=1
  else
    echo "self-test ok: test-file hosts ignored"
  fi

  return "$rc"
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit $?
fi

if [[ -n "${1:-}" ]]; then
  REPO_ROOT="$1"
else
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
WEB_ROOT="$REPO_ROOT/apps/web"

if [[ ! -d "$WEB_ROOT" ]]; then
  echo "check-external-hosts: no apps/web in $REPO_ROOT" >&2
  exit 2
fi

bad="$(unapproved "$WEB_ROOT")"
if [[ -z "$bad" ]]; then
  echo "✓ no unapproved external hosts in the web sources"
  exit 0
fi

echo "ERROR: unapproved external host(s) in the web sources:" >&2
while IFS= read -r host; do
  echo "  ✗ $host" >&2
done <<< "$bad"
echo "    The game ships zero third-party dependencies (v0.23.2). If this host is" >&2
echo "    genuinely required, add it to the ALLOWLIST in scripts/check-external-hosts.sh" >&2
echo "    with a reason — a deploy can never silently introduce a new external host." >&2
exit 1
