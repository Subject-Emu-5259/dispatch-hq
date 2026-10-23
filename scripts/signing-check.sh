#!/usr/bin/env bash
# ============================================================
# signing-check.sh — report the desktop code-signing setup
# ============================================================
# Tells you, in one command, whether the next build-release.sh will produce
# signed/notarized macOS apps and signed Windows installers, and exactly what
# to configure if not. Safe to run anytime — read-only.
#
# Usage: scripts/signing-check.sh
# Exit code: 0 = everything ready, 1 = something missing.
# ============================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MISSING=0
note() { echo "  $1"; }
ok()   { echo "  ✓ $1"; }
warn() { echo "  ✗ $1"; MISSING=1; }

echo "=== Dispatch HQ desktop signing status ==="
echo ""

echo "[macOS] Developer ID (Gatekeeper)"
if [[ "$(uname -s)" == "Darwin" ]]; then
  ID_COUNT="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/^ *\([0-9][0-9]*\) valid identities found.*/\1/p')"
  if [[ -z "$ID_COUNT" || "$ID_COUNT" -eq 0 ]]; then
    warn "No Developer ID identity in the login keychain."
    note "  Get one: https://developer.apple.com/account → Certificates → Developer ID Application"
    note "  Then:    security import <cert>.p12 -k ~/Library/Keychains/login.keychain-db"
  else
    ok "Developer ID identity found ($ID_COUNT valid) — build-release.sh will sign."
  fi
else
  note "Not on macOS — macOS signing happens on a Mac (or CI with a Mac runner)."
fi

if [[ -n "${CSC_LINK:-}" || -n "${CSC_NAME:-}" ]]; then
  ok "CSC_LINK/CSC_NAME set — electron-builder has an explicit identity source."
else
  note "  (CSC_LINK/CSC_NAME unset — electron-builder falls back to the login keychain.)"
fi

echo ""
echo "[macOS] Notarization + stapling (the 'unidentified developer' warning)"
if [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  ok "APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID all set — notarize + staple active."
else
  warn "Missing one of APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID."
  note "  App-specific password: https://appleid.apple.com → Sign-In & Security → App-Specific Passwords"
  note "  Team ID: https://developer.apple.com/account → Membership details (10-char)"
  note "  Export:  CSC_LINK=<path-to-.p12> CSC_KEY_PASSWORD=<p12-pass> \\"
  note "           APPLE_ID=<your@apple.com> APPLE_APP_SPECIFIC_PASSWORD=<pw> APPLE_TEAM_ID=<id> \\"
  note "           bash apps/desktop/scripts/build-release.sh all"
fi

echo ""
echo "[Windows] Authenticode (SmartScreen)"
if [[ -n "${CSC_LINK:-}" || -n "${WIN_CSC_LINK:-}" ]]; then
  ok "CSC_LINK/WIN_CSC_LINK set — electron-builder will sign the installer."
  if [[ -n "${WIN_CSC_KEY_PASSWORD:-}" ]]; then
    ok "WIN_CSC_KEY_PASSWORD set."
  else
    warn "WIN_CSC_KEY_PASSWORD missing (or CSC_KEY_PASSWORD if using CSC_LINK)."
  fi
else
  warn "No Windows code-signing cert configured (CSC_LINK or WIN_CSC_LINK)."
  note "  Options:"
  note "    • Get a code-signing cert (e.g. DigiCert/Sectigo EV or OV) and export the .pfx."
  note "    • Prefer a Windows CI runner (GitHub Actions windows-latest) — electron-builder"
  note "      signs there with signtool automatically when the cert env is set."
  note "    • On macOS building the Windows target, signing needs wine + the cert;"
  note "      a Windows runner avoids both."
fi

echo ""
if [[ "$MISSING" -eq 1 ]]; then
  echo "Result: NOT fully signed — see the ✗ items above."
  echo "Until then builds ship unsigned (Gatekeeper/SmartScreen warn on first launch)."
  exit 1
fi
echo "Result: signing fully configured — next build-release.sh will sign everything."
exit 0
