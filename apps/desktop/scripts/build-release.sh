#!/usr/bin/env bash
# ============================================================
# build-release.sh — build ALL Dispatch HQ desktop artifacts and
# publish them to dist/ (the releases folder).
#
# Platforms (usage: bash apps/desktop/scripts/build-release.sh [all|mac|win|linux]):
#   macOS   universal (arm64 + x64) DMG + zip   -> dist/mac/
#   Windows NSIS x64 setup.exe                  -> dist/windows/
#   Linux   AppImage x64                        -> dist/linux/
#
# Signing / notarization (macOS, auto-detected):
#   - Signs with a Developer ID when an identity exists (CSC_NAME, or
#     CSC_LINK + CSC_KEY_PASSWORD, or a cert in the login keychain).
#   - Notarizes + staples when APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and
#     APPLE_TEAM_ID are ALL set AND the app is genuinely signed.
#   - Otherwise builds an unsigned (ad-hoc) universal DMG — the pipeline
#     never hard-fails on a machine with no Apple credentials.
#
# Release gate:
#   Runs the packaged universal app with DHQ_SMOKE=1 and FAILS the release
#   if the game page does not render (the "DMG must render" gate).
#
# Output:
#   dist/mac/ windows/ linux/ + dist/SHA256SUMS.txt + dist/README.txt
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
cd "$APP_DIR"

TARGET="${1:-all}"
VERSION="$(node -p "require('./package.json').version")"
DIST="$REPO_ROOT/dist"
APP_URL="${DHQ_APP_URL:-https://dispatch-hq.onrender.com}"

echo "=== Dispatch HQ desktop release build — v$VERSION ($TARGET) ==="

# --- 0. compile the shell ---
echo "--- tsc ---"
npm run build

# --- 1. signing / notarization detection (macOS only) ---
IDENTITY_ARGS=""
NOTARIZE_ARGS=""
if [[ "$(uname -s)" == "Darwin" ]]; then
  ID_COUNT="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/^ *\([0-9][0-9]*\) valid identities found.*/\1/p')"
  if [[ -z "$ID_COUNT" || "$ID_COUNT" -eq 0 ]]; then
    IDENTITY_ARGS="-c.mac.identity=null"
    echo "⚠️  No Developer ID identity found — building unsigned (ad-hoc) macOS app."
  else
    echo "✓ Developer ID identity found ($ID_COUNT) — the macOS app will be signed."
  fi
  if [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" && -z "$IDENTITY_ARGS" ]]; then
    NOTARIZE_ARGS="-c.notarize=true"
    echo "✓ APPLE_* credentials present — will notarize + staple."
  else
    echo "⚠️  Missing APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID (or unsigned) — skipping notarization."
  fi
fi

# --- 2. clean previous release output ---
rm -rf release
mkdir -p release

# --- 3. build macOS universal DMG + zip ---
if [[ "$TARGET" == "all" || "$TARGET" == "mac" ]]; then
  echo "--- electron-builder: macOS universal (dmg + zip) ---"
  # shellcheck disable=SC2086  # empty IDENTITY_ARGS/NOTARIZE_ARGS expand to nothing
  npx electron-builder --mac --universal $IDENTITY_ARGS $NOTARIZE_ARGS
  # electron-builder >=25 lands DMG/zip at release/ root; older versions put
  # them under release/mac-universal/. Accept both so the pipeline is
  # version-agnostic.
  # globs that match nothing make `ls` exit non-zero, which under set -euo
  # pipefail kills the pipeline — split the two locations so a no-match is
  # harmless, and take the first hit (release/ root is the >=25 layout).
  DMG=""
  for cand in release/*.dmg release/mac-universal/*.dmg; do
    [ -e "$cand" ] && { DMG="$cand"; break; }
  done
  echo "--- verify universal binary (expect: x86_64 arm64) ---"
  lipo -info "release/mac-universal/Dispatch HQ.app/Contents/MacOS/Dispatch HQ"
  echo "--- verify DMG ---"
  hdiutil verify "$DMG"
fi

# --- 4. build Windows NSIS (x64) — tolerated failure on non-Windows hosts ---
WIN_OK=0
if [[ "$TARGET" == "all" || "$TARGET" == "win" ]]; then
  echo "--- electron-builder: Windows NSIS (x64) ---"
  # No CLI target/arch args: the yml win.target arch (x64) must drive the
  # build, otherwise `--win nsis` on an arm64 host silently builds arm64.
  if npx electron-builder --win; then
    WIN_OK=1
  else
    echo "⚠️  Windows NSIS build failed on this host. It may need wine (macOS) or a"
    echo "    Windows runner. Run it there with: pnpm --filter @dispatch-hq/desktop package:win"
  fi
fi

# --- 5. build Linux AppImage (x64) ---
LINUX_OK=0
if [[ "$TARGET" == "all" || "$TARGET" == "linux" ]]; then
  echo "--- electron-builder: Linux AppImage (x64) ---"
  # Same reasoning as Windows: let the yml linux.target arch (x64) drive it.
  if npx electron-builder --linux; then
    LINUX_OK=1
  else
    echo "⚠️  Linux AppImage build failed on this host."
  fi
fi

# --- 6. RELEASE GATE — the packaged universal app must render the game ---
if [[ "$TARGET" == "all" || "$TARGET" == "mac" ]]; then
  if [[ "${SKIP_SMOKE:-0}" == "1" ]]; then
    echo "⚠️  SKIP_SMOKE=1 — skipping the packaged-app render gate."
  else
    echo "--- smoke gate: packaged universal app must render the game ---"
    APP_BIN="release/mac-universal/Dispatch HQ.app/Contents/MacOS/Dispatch HQ"
    set +e
    SMOKE_OUT="$(DHQ_SMOKE=1 DHQ_APP_URL="$APP_URL" "$APP_BIN" 2>&1)"
    SMOKE_RC=$?
    set -e
    if [[ $SMOKE_RC -ne 0 ]] || ! grep -q 'SMOKE_OK' <<<"$SMOKE_OUT"; then
      echo "❌ SMOKE GATE FAILED — the DMG app could not render the game (exit $SMOKE_RC)."
      tail -20 <<<"$SMOKE_OUT"
      exit 1
    fi
    grep 'SMOKE_OK' <<<"$SMOKE_OUT"
  fi
fi

# --- 7. publish to dist/ ---
echo "--- publish to $DIST ---"
mkdir -p "$DIST/mac" "$DIST/windows" "$DIST/linux"
if [[ "$TARGET" == "all" || "$TARGET" == "mac" ]]; then
  # Only mac artifacts (dmg/zip + their blockmaps). The release/ root also
  # holds the win .exe.blockmap from the win build — exclude any *-setup.*
  # so it never lands in mac/ (the win publish step owns it).
  for f in release/*.dmg release/*.zip release/mac-universal/*.dmg release/mac-universal/*.zip; do
    [ -e "$f" ] && cp "$f" "$DIST/mac/"
  done
  for f in release/*.dmg.blockmap release/*.zip.blockmap release/mac-universal/*.dmg.blockmap release/mac-universal/*.zip.blockmap; do
    [ -e "$f" ] && cp "$f" "$DIST/mac/"
  done
fi
if [[ "$WIN_OK" -eq 1 ]]; then
  for f in release/*.exe release/*.exe.blockmap; do
    [ -e "$f" ] && cp "$f" "$DIST/windows/"
  done
fi
if [[ "$LINUX_OK" -eq 1 ]]; then
  for f in release/*.AppImage; do
    [ -e "$f" ] && cp "$f" "$DIST/linux/"
  done
fi

# --- 8. regenerate SHA256SUMS.txt + README.txt ---
cd "$DIST"
echo "--- regenerate SHA256SUMS.txt + README.txt ---"
{
  find mac windows linux clickable -maxdepth 1 -type f -not -name '.DS_Store' 2>/dev/null | sort
} | while read -r f; do
  [ -n "$f" ] && shasum -a 256 "$f"
done > SHA256SUMS.txt

cat > README.txt <<'EOF'
============================================================
 Dispatch HQ — Release Artifacts
============================================================
This folder holds every distributable build of the Dispatch HQ
desktop app. The desktop app is a thin Electron shell: it loads
the live game from the server, so EVERY launch is already the
latest game version — you never need to re-download for a game
update. (The shell itself is versioned independently; the game
version is shown in the app's window title and the main menu.)

WHAT'S HERE
------------------------------------------------------------
mac/
  DispatchHQ-<ver>-universal.dmg   Installable macOS app.
                                   Universal binary — runs on
                                   Apple Silicon AND Intel Macs.
                                   Install: open the DMG, drag
                                   "Dispatch HQ" into Applications.
                                   First launch on a fresh Mac:
                                   right-click -> Open if Gatekeeper
                                   complains about an unsigned build.

windows/
  DispatchHQ-<ver>-x64-setup.exe   Windows installer (NSIS).
                                   Install: double-click, follow
                                   the wizard (optional: change the
                                   install directory).

linux/
  DispatchHQ-<ver>-x64.AppImage    Portable Linux app (no install).
                                   Run: chmod +x the file, then
                                   ./DispatchHQ-<ver>-x64.AppImage
                                   (most distros also open it by
                                   double-clicking).

clickable/
  DispatchHQ-<ver>-clickable.zip   No-install browser version.
                                   Unzip -> double-click
                                   DispatchHQ.command (needs
                                   Node.js 18+ and internet).

REQUIREMENTS
------------------------------------------------------------
- Internet connection (the game, its map tiles, and its
  services are served live).
- macOS: any Intel or Apple Silicon Mac on macOS 11+.
- Windows: Windows 10/11 (x64).
- Linux: glibc-based distro (Ubuntu, Fedora, Debian…).

HOW TO VERIFY DOWNLOADS (SHA-256)
------------------------------------------------------------
Each release ships a SHA256SUMS.txt listing every artifact's
checksum. Verify a file before installing:

  macOS / Linux:
      cd <this folder>
      shasum -a 256 -c SHA256SUMS.txt          # checks ALL files
      shasum -a 256 mac/DispatchHQ-<ver>-universal.dmg   # or one file
      # compare the hash to the matching line in SHA256SUMS.txt

  Windows (PowerShell):
      cd <this folder>
      Get-FileHash .\windows\DispatchHQ-<ver>-x64-setup.exe -Algorithm SHA256
      # compare to the matching line in SHA256SUMS.txt

If a hash does not match, the download is corrupt or tampered
with — delete it and re-download.
============================================================
EOF
echo "✓ Published:"
find mac windows linux clickable -maxdepth 1 -type f 2>/dev/null | sort | sed 's/^/    /'
echo "✓ SHA256SUMS.txt + README.txt regenerated."

if [[ "$TARGET" == "all" && "$WIN_OK" -eq 0 ]]; then
  echo ""
  echo "⚠️  WINDOWS BUILD WAS SKIPPED/FAILED on this host — publish dist/windows/ from a Windows"
  echo "    runner: pnpm --filter @dispatch-hq/desktop package:win"
fi
if [[ "$TARGET" == "all" && "$LINUX_OK" -eq 0 ]]; then
  echo ""
  echo "⚠️  LINUX BUILD WAS SKIPPED/FAILED on this host — publish dist/linux/ from a Linux"
  echo "    runner: pnpm --filter @dispatch-hq/desktop package:linux"
fi
echo ""
echo "=== desktop release build complete (v$VERSION) ==="
