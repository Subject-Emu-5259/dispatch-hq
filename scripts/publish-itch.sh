#!/usr/bin/env bash
# ============================================================
# publish-itch.sh — push Dispatch HQ desktop builds to itch.io
# ============================================================
# Uploads the three platform artifacts from dist/ (produced by
# apps/desktop/scripts/build-release.sh) to your itch.io project
# via butler, one channel per platform:
#
#   mac-universal.dmg        -> <user>/dispatch-hq:mac
#   x64-setup.exe            -> <user>/dispatch-hq:windows
#   x86_64.AppImage          -> <user>/dispatch-hq:linux
#
# --userversion is the GAME version (from apps/web/src/data/releaseNotes.ts),
# not the desktop shell version, so the itch build list reads like the game
# releases (0.29.4, 0.30.0, …).
#
# Usage:
#   scripts/publish-itch.sh <user>/<game> [--preview|--push] [--dry-run]
#
#   <user>/<game>   your itch project, e.g. deandrewharris/dispatch-hq
#                   (matches https://<user>.itch.io/<game>, all lowercase)
#   --preview       butler push-preview per channel (auth + diff, no upload)
#   --push          real upload (butler push)
#   --dry-run       with --push: list files butler would send, no upload
#   (no mode flag)  prints the exact commands, does nothing
#
# Default is safe: with no --preview/--push it only prints what it would run.
# Requires: butler installed (https://itch.io/butler) + `butler login` once.
# ============================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TARGET="${1:-}"
MODE="print"          # print | preview | push
EXTRA_DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --preview) MODE="preview" ;;
    --push)    MODE="push" ;;
    --dry-run) EXTRA_DRY_RUN=1 ;;
  esac
done

if [[ -z "$TARGET" || "$TARGET" == --* ]]; then
  echo "usage: scripts/publish-itch.sh <user>/<game> [--preview|--push] [--dry-run]" >&2
  echo "  e.g.  scripts/publish-itch.sh deandrewharris/dispatch-hq --preview" >&2
  exit 1
fi
case "$TARGET" in
  */*) ;;
  *) echo "ERROR: target must be user/game (e.g. deandrewharris/dispatch-hq)" >&2; exit 1 ;;
esac

# --- butler present? (print mode never needs it) ---
if [[ "$MODE" != "print" ]] && ! command -v butler >/dev/null 2>&1; then
  echo "ERROR: butler is not installed. Install it first:" >&2
  echo "  macOS:  brew install butler, or download from https://itchio.itch.io/butler" >&2
  echo "          (unzip to ~/bin, chmod +x, add to PATH)" >&2
  echo "  Or use the itch app (v26.12+) which bundles butler and has a Builds UI:" >&2
  echo "          https://itch.io/app" >&2
  echo "Then authenticate once: butler login" >&2
  exit 1
fi

# --- game version (the --userversion) from the release notes ---
GAME_VER="$(sed -n '/RELEASE_NOTES: ReleaseNote\[\] = \[/,/version: .[0-9]/p' apps/web/src/data/releaseNotes.ts \
  | grep -m1 -oE "version: '[0-9]+\.[0-9]+\.[0-9]+'" | sed -E "s/version: '([^']+)'/\1/")"
if [[ -z "$GAME_VER" ]]; then
  echo "ERROR: could not read the game version from apps/web/src/data/releaseNotes.ts" >&2
  exit 1
fi
echo "=== Dispatch HQ → itch.io ($TARGET) — game v$GAME_VER ==="

# --- locate artifacts ---
DMG="$(ls dist/mac/DispatchHQ-*-universal.dmg 2>/dev/null | head -1 || true)"
EXE="$(ls dist/windows/DispatchHQ-*-x64-setup.exe 2>/dev/null | head -1 || true)"
APPIMAGE="$(ls dist/linux/DispatchHQ-*-x86_64.AppImage 2>/dev/null | head -1 || true)"

declare -a SLOTS
SLOTS=()
if [[ -n "$DMG" ]]; then      SLOTS+=("$DMG|mac"); fi
if [[ -n "$EXE" ]]; then      SLOTS+=("$EXE|windows"); fi
if [[ -n "$APPIMAGE" ]]; then SLOTS+=("$APPIMAGE|linux"); fi

if [[ ${#SLOTS[@]} -eq 0 ]]; then
  echo "ERROR: no desktop artifacts found in dist/. Build them first:" >&2
  echo "  bash apps/desktop/scripts/build-release.sh all" >&2
  exit 1
fi

# --- authentication guard: butler's default identity file exists? ---
# `butler status` is NOT an auth probe (it requires a <target>), so check the
# credentials file at butler's default --identity path instead.
BUTLER_CREDS="$HOME/Library/Application Support/itch/butler_creds"
if [[ "$MODE" != "print" && ! -f "$BUTLER_CREDS" ]]; then
  echo "ERROR: no butler credentials found at $BUTLER_CREDS" >&2
  echo "       Run: butler login" >&2
  exit 1
fi

echo ""
echo "Channels:"
for slot in "${SLOTS[@]}"; do
  file="${slot%%|*}"; chan="${slot##*|}"
  echo "  $chan <- $file"
done

case "$MODE" in
  print)
    echo ""
    echo "Dry-run of the commands that would run (no upload):"
    for slot in "${SLOTS[@]}"; do
      file="${slot%%|*}"; chan="${slot##*|}"
      printf '  butler push "%s" %s:%s --userversion %s\n' "$file" "$TARGET" "$chan" "$GAME_VER"
    done
    echo ""
    echo "Re-run with --preview to diff against the live build, or --push to upload."
    ;;
  preview)
    echo ""
    for slot in "${SLOTS[@]}"; do
      file="${slot%%|*}"; chan="${slot##*|}"
      echo "--- push-preview $chan ---"
      butler push-preview "$file" "$TARGET:$chan"
      echo ""
    done
    ;;
  push)
    DRY_FLAG=""
    if [[ "$EXTRA_DRY_RUN" -eq 1 ]]; then
      DRY_FLAG="--dry-run"
      echo "--- --dry-run: listing files butler would send (no upload) ---"
    fi
    for slot in "${SLOTS[@]}"; do
      file="${slot%%|*}"; chan="${slot##*|}"
      echo "--- push $chan ---"
      butler push "$file" "$TARGET:$chan" --userversion "$GAME_VER" $DRY_FLAG
      echo ""
    done
    echo "✓ Pushed to https://${TARGET%%/*}.itch.io/${TARGET#*/}"
    echo "  Set the page Kind to 'Downloadable' and each channel's platform tags"
    echo "  (butler names them mac/windows/linux, so tags come pre-set)."
    ;;
esac
