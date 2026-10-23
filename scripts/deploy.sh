#!/usr/bin/env bash
# ============================================================
# deploy.sh — one-command Dispatch HQ release pipeline
# Automates plans/RELEASES.md §2–§4:
#   builds the transfer tarball, uploads it, verifies byte-exact,
#   generates the Zo deploy script + API payload, and prints (or
#   runs, with --run) the Zo API command.
#
# Usage:
#   scripts/deploy.sh <VERSION> <file...> [--catbox] [--db-push] [--dry-run] [--run]
#
#   <VERSION>   semantic version, e.g. 0.13.1
#   <file...>   changed files, project-relative (run from the MAIN
#               checkout, where files are synced + version-bumped)
#   --catbox    upload host (default: litterbox)
#   --db-push   also run drizzle-kit push on the instance after the build
#               (use when the release adds or alters DB tables/columns)
#   --dry-run   build tarball + generate everything, skip upload
#   --run       execute the deploy API call (requires $ZO_API_KEY)
#
# Post-deploy (--run only): re-stamps the itch.io desktop build list at the
#   new game version (the shells load the live app, so only the version
#   metadata changes). Env overrides: ITCH_TARGET (default agreatgame/dispatch-hq),
#   SKIP_ITCH_STAMP=1 to skip.
#
# Outputs:
#   /tmp/v<VER>.tgz          the transfer tarball
#   /tmp/v<VER>.hashes       per-file sha256 manifest
#   /tmp/v<VER>-deploy.sh    the script Zo runs (backup/transfer/build)
#   /tmp/v<VER>-payload.json the {"input": "..."} API payload
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

VERSION=""
FILES=()
UPLOAD_HOST="litterbox"
DRY_RUN=0
DO_RUN=0
DB_PUSH=0
# Live instance used by the downgrade guard (override with DHQ_LIVE_URL).
LIVE_BASE="${DHQ_LIVE_URL:-https://dispatch-hq-deandrewharris.zocomputer.io}"

# semver compare: ver_gt A B exits 0 iff A > B (x.y.z).
# MUST be defined before the drift gate (section 0.7) calls it.
ver_gt() {
  local a b i
  IFS='.' read -r -a a <<< "$1"
  IFS='.' read -r -a b <<< "$2"
  for i in 0 1 2; do
    if [[ "${a[i]:-0}" -gt "${b[i]:-0}" ]]; then return 0; fi
    if [[ "${a[i]:-0}" -lt "${b[i]:-0}" ]]; then return 1; fi
  done
  return 1
}

usage() {
  sed -n '2,24p' "$SCRIPT_DIR/deploy.sh" | sed 's/^# \{0,1\}//'
  exit 0
}

# --- parse args ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --catbox)   UPLOAD_HOST="catbox"; shift ;;
    --db-push)  DB_PUSH=1; shift ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --run)      DO_RUN=1; shift ;;
    --help|-h)  usage ;;
    --*)        echo "Unknown option: $1" >&2; usage ;;
    *)
      if [[ -z "$VERSION" ]]; then VERSION="$1"
      else FILES+=("$1"); fi
      shift ;;
  esac
done

# --- validate ---
if [[ -z "$VERSION" ]]; then
  echo "ERROR: missing <VERSION> (e.g. scripts/deploy.sh 0.13.1 apps/web/src/App.tsx)" >&2
  usage
fi
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: VERSION must be X.Y.Z, got '$VERSION'" >&2
  exit 1
fi
if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "ERROR: no files given" >&2
  usage
fi
for f in "${FILES[@]}"; do
  [[ "$f" != /* ]] || { echo "ERROR: paths must be project-relative, got absolute: $f" >&2; exit 1; }
  # v0.22.0: tightened message — a dropped/typo'd path (the v0.21.1
  # AdminPanel.tsx class) or an accidentally-listed directory dies here with
  # a clear message instead of an opaque tar error later.
  [[ -f "$f" ]] || { echo "ERROR: '$f' is not a regular file on disk (missing, typo'd, or a directory) — check the <file...> arg list for a dropped or wrong path." >&2; exit 1; }
done

# --- 0.5. IMPORT-COVERAGE PRE-FLIGHT — a changed file that imports a project-local
# module NOT in the transfer tarball is the v0.19.0/0.19.1 drift class (ProfileModal.tsx
# shipped while its dependency GuestUpgradeCard.tsx stayed stale on the instance). The
# instance holds an old copy of any file not in the manifest, so warn loudly whenever a
# changed file imports a repo file that is not in <file...>. Add those files if they
# changed, or confirm they are already byte-identical on the instance.
MISSING_IMPORTS=()
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue
  dir="$(dirname "$f")"
  while IFS= read -r imp; do
    [[ -z "$imp" || "$imp" != ./* && "$imp" != ../* ]] && continue
    cand="$dir/${imp#./}"
    for ext in '' .ts .tsx .js .jsx; do
      [[ -f "$cand$ext" ]] && cand="$cand$ext" && break
    done
    [[ -f "$cand" ]] || continue
    rel="${cand#./}"
    in_manifest=0
    for mf in "${FILES[@]}"; do [[ "$mf" == "$rel" ]] && in_manifest=1 && break; done
    [[ "$in_manifest" -eq 1 ]] || MISSING_IMPORTS+=("$rel")
  done < <(grep -oE "from '[^']+'" "$f" | cut -d"'" -f2)
done
if [[ ${#MISSING_IMPORTS[@]} -gt 0 ]]; then
  echo "⚠️  IMPORT-COVERAGE WARNING — imported by changed files but NOT in the tarball:"
  printf '    - %s\n' "${MISSING_IMPORTS[@]}"
  echo "    Stale instance copies of these can break the build (the v0.19.0/0.19.1"
  echo "    ProfileModal/GuestUpgradeCard incidents). Add them to <file...> if changed,"
  echo "    or verify they are already byte-identical on the instance."
  echo ""
fi

# --- 0.6. SERVICE-WORKER CACHE GATE — any release that ships a web-facing file
# (apps/web/* or packages/* — both feed the built client bundle) MUST bump the
# service-worker CACHE_NAME. The SW's own comment mandates it (the v0.19.3
# incident: CACHE_NAME sat at 'dispatch-hq-v3' since the SW's initial commit, so
# returning clients kept serving a stale bundle that rendered the mission popup
# white and unresponsive). Automate the bump so it can never be forgotten again:
# parse the current version, bump it, and auto-add the SW to the transfer tarball
# so the instance serves the new cache name on this very release.
SW_FILE="apps/web/public/service-worker.js"
WEB_TOUCHED=0
for f in "${FILES[@]}"; do
  case "$f" in
    apps/web/*|packages/*) WEB_TOUCHED=1 ;;
  esac
  [[ "$WEB_TOUCHED" -eq 1 ]] && break
done
if [[ "$WEB_TOUCHED" -eq 1 ]]; then
  if [[ ! -f "$SW_FILE" ]]; then
    echo "ERROR: this release ships a web bundle but $SW_FILE is missing — the stale-cache bug class is guaranteed" >&2
    exit 1
  fi
  SW_VER="$(sed -n "s/^const CACHE_NAME = 'dispatch-hq-v\([0-9][0-9]*\)';/\1/p" "$SW_FILE" | head -1)"
  if [[ -z "$SW_VER" ]]; then
    echo "ERROR: could not parse CACHE_NAME version from $SW_FILE — refusing to auto-bump" >&2
    exit 1
  fi
  SW_NEW=$((SW_VER + 1))
  # Portable in-place edit: `-i.bak` is valid on both macOS/BSD sed and GNU sed;
  # then drop the backup. The write is VERIFIED below — sed exits 0 even when it
  # replaced nothing, so success is only claimed after the new version is confirmed
  # in the file (the fail-loud culture from the 5.5 post-build re-verify).
  sed -i.bak "s/^const CACHE_NAME = 'dispatch-hq-v${SW_VER}';/const CACHE_NAME = 'dispatch-hq-v${SW_NEW}';/" "$SW_FILE" && rm -f "$SW_FILE.bak"
  # Verify the full line landed — matching just the bare version misses the
  # trailing apostrophe ('dispatch-hq-v7';) and false-fails, exactly what the
  # fail-loud gate is supposed to catch.
  grep -q "const CACHE_NAME = 'dispatch-hq-v${SW_NEW}';" "$SW_FILE" || {
    echo "ERROR: SW cache bump did not take effect in $SW_FILE (wanted v${SW_NEW})" >&2
    exit 1
  }
  echo "⚠️  SW CACHE GATE: dispatch-hq-v${SW_VER} → dispatch-hq-v${SW_NEW} in $SW_FILE (this release ships a web bundle)"
  IN_LIST=0
  for f in "${FILES[@]}"; do [[ "$f" == "$SW_FILE" ]] && IN_LIST=1 && break; done
  if [[ "$IN_LIST" -eq 0 ]]; then
    FILES+=("$SW_FILE")
    echo "    +$SW_FILE auto-added to the transfer tarball"
  fi
  echo ""
fi

# --- 0.7. VERSION / RELEASE-NOTE DRIFT GATE — the v0.19.6 incident: the tarball
# was built from a checkout whose version bump + release note had NOT been
# synced (the edits landed in a Freebuff worktree while deploy.sh reads from
# THIS checkout), so the bundle shipped the previous release note while /health
# was patched on the instance to claim the new version. These checks make the
# tarball's version-bearing files PROVE they actually carry VERSION, and fail
# loudly BEFORE upload if they don't.
if [[ "$REPO_ROOT" == *".freebuff/worktrees/"* ]]; then
  echo "⚠️  Running from a Freebuff worktree ($REPO_ROOT) — the tarball is built from THIS checkout."
  echo "    Confirm the version bump + release notes were synced here (worktree-vs-main drift) or"
  echo "    this release will ship a stale version (the v0.19.6 incident)."
fi

RN_FILE="apps/web/src/data/releaseNotes.ts"
RN_IN_LIST=0
for f in "${FILES[@]}"; do [[ "$f" == "$RN_FILE" ]] && RN_IN_LIST=1; done
if [[ "$WEB_TOUCHED" -eq 1 ]]; then
  if [[ "$RN_IN_LIST" -eq 0 ]]; then
    echo "ERROR: this release ships a web bundle but $RN_FILE is not in the transfer tarball — the main menu footer would keep showing an older version (the v0.19.6 drift bug). Add the bumped release note to <file...>." >&2
    exit 1
  fi
  FIRST_NOTE="$(awk '/export const RELEASE_NOTES/{f=1} f && /version:/{gsub(/[^0-9.]/,"",$0); print; exit}' "$RN_FILE")"
  if [[ -z "$FIRST_NOTE" ]]; then
    echo "ERROR: could not parse the first release-note version from $RN_FILE" >&2
    exit 1
  fi
  if [[ "$FIRST_NOTE" != "$VERSION" ]]; then
    echo "ERROR: $RN_FILE leads with v${FIRST_NOTE} but you are deploying v${VERSION} — stale/wrong checkout (worktree-vs-main drift). Sync the release-note bump and re-run." >&2
    exit 1
  fi
  echo "✓ release note leads with v${VERSION} ($RN_FILE)"
fi

# EXTERNAL-HOST GATE (v0.23.2) — the game ships zero third-party dependencies
# (self-hosted fonts/tiles/routing/geocoding). Any unapproved https host in the
# web sources fails here, BEFORE upload, so an accidental CDN/analytics/third-
# party fetch can never ship again. See scripts/check-external-hosts.sh.
if [[ "$WEB_TOUCHED" -eq 1 ]]; then
  if ! "$SCRIPT_DIR/check-external-hosts.sh" "$REPO_ROOT"; then
    echo "ERROR: external-host gate failed — refusing to deploy. Remove the offending host(s) or allowlist them deliberately (with a reason) in scripts/check-external-hosts.sh." >&2
    exit 1
  fi
fi

# SERVER VERSION CONSTANT GATE (v0.22.4 lesson) — /health reports the version
# from serve-combined.ts (prod entrypoint) and index.ts (dev). The OLD gate
# only checked these two files when they happened to be in <file...>, so a
# web-only release whose constants were never bumped sailed through and /health
# kept reporting the previous version after restart. Now BOTH constants MUST
# carry VERSION in THIS checkout, and both are force-added to the transfer
# tarball — a missing server version bump fails here, before upload, instead of
# surfacing as a stale /health after restart.
for svf in servers/game-server/src/index.ts servers/game-server/src/serve-combined.ts; do
  [[ -f "$svf" ]] || {
    echo "ERROR: $svf is missing — cannot verify the server version constant. Sync the file to this checkout and re-run." >&2
    exit 1
  }
  v="$(grep -oE "version: *['\"][0-9]+\.[0-9]+\.[0-9]+['\"]" "$svf" | head -1 | tr -cd '0-9.')"
  if [[ -z "$v" ]]; then
    echo "ERROR: could not parse the version constant from $svf" >&2
    exit 1
  fi
  if [[ "$v" != "$VERSION" ]]; then
    echo "ERROR: $svf reports v${v} but you are deploying v${VERSION} — the server version constants were not bumped. Edit the version constant in BOTH servers/game-server/src/index.ts and servers/game-server/src/serve-combined.ts (the v0.22.4 lesson: /health is a manual bump) and re-run." >&2
    exit 1
  fi
  echo "✓ $svf carries v${VERSION}"
  # Force both into the tarball so the running instance actually serves this
  # /health version (same auto-add pattern as the service worker).
  in_list=0
  for f in "${FILES[@]}"; do [[ "$f" == "$svf" ]] && in_list=1 && break; done
  if [[ "$in_list" -eq 0 ]]; then
    FILES+=("$svf")
    echo "    +$svf auto-added to the transfer tarball (so /health serves v${VERSION})"
  fi
done

# Downgrade guard: the live instance must not already be NEWER than VERSION
# (deploying an older tarball against a newer live is the phantom-/health class).
if [[ "$DRY_RUN" -eq 0 ]]; then
  # The live host can be unreachable or in maintenance (a proxy "site
  # unavailable" body has no version string). That is the skip-the-guard
  # condition the else-branch below was written for — NOT a hard stop. But
  # grep exits 1 on no match and `set -o pipefail` propagates it, so the raw
  # substitution kills the script before the warning ever prints (the
  # v0.24.0 staging incident). Catch the failing pipeline: empty version =
  # skip the guard.
  LIVE_VER="$(curl -s -m 15 "${LIVE_BASE}/health" 2>/dev/null | grep -oE '"version"[[:space:]]*:[[:space:]]*"[0-9]+\.[0-9]+\.[0-9]+"' | head -1 | tr -cd '0-9.')" || LIVE_VER=""
  if [[ -n "$LIVE_VER" ]]; then
    if ver_gt "$LIVE_VER" "$VERSION"; then
      echo "ERROR: live ${LIVE_BASE}/health already reports v${LIVE_VER} but you are deploying v${VERSION} — downgrade or wrong tarball. Refusing to deploy." >&2
      exit 1
    fi
    echo "✓ live is v${LIVE_VER} → deploying v${VERSION}"
  else
    echo "⚠️  Could not read a version from ${LIVE_BASE}/health — skipping the live downgrade guard."
  fi
fi
echo ""

TAG="v${VERSION//./}"     # 0.13.1 -> v0131
TBZ="/tmp/${TAG}.tgz"
MANIFEST="/tmp/${TAG}.hashes"
DEPLOY="/tmp/${TAG}-deploy.sh"
PAYLOAD="/tmp/${TAG}-payload.json"

hashfile() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi }

upload_to() {
  local host="$1"
  local endpoint
  case "$host" in
    catbox)    endpoint="https://catbox.moe/user/api.php" ;;
    litterbox) endpoint="https://litter.catbox.moe/resources/internals/api.php" ;;
  esac
  curl -s -m 90 -F reqtype=fileupload -F "fileToUpload=@$TBZ" "$endpoint"
}

# --- 1. tarball (project-relative paths so tar -xzf extracts in place) ---
# Disable AppleDouble: macOS tar embeds ._* resource-fork entries (extended
# attributes) by default, and the Linux instance extracts them as literal junk
# files scattered through the tree (37 found in the v0.22.4 cleanup). The env
# var stops them at the source so the instance tree stays byte-exact to main.
export COPYFILE_DISABLE=1
export COPY_EXTENDED_ATTRIBUTES_DISABLE=1
rm -f "$TBZ"
tar -czf "$TBZ" "${FILES[@]}"
TBZ_SHA="$(hashfile "$TBZ" | awk '{print $1}')"
hashfile "${FILES[@]}" > "$MANIFEST"

echo "=== Tarball ==="
echo "$TBZ  ($TBZ_SHA)"
echo ""

# --- 1.5. TARBALL-COMPLETENESS GATE (v0.22.0) — the generated manifest MUST
# contain exactly the requested files: every path from <file...> (plus any
# auto-added files like the service worker) present, and nothing silently
# skipped. The on-disk arg-validation (above, section "validate") catches
# dropped/typo'd paths before this; this gate is the backstop for any
# tar/hashfile divergence that would ship a tarball missing a requested file.
MISSING_COUNT=0
for f in "${FILES[@]}"; do
  if ! awk '{print $2}' "$MANIFEST" | grep -qxF -- "$f"; then
    echo "ERROR: '$f' is missing from the tarball manifest — refusing to upload. Add it to <file...> (or check the arg list for a dropped path)." >&2
    MISSING_COUNT=$((MISSING_COUNT + 1))
  fi
done
MANIFEST_COUNT="$(wc -l < "$MANIFEST" | tr -d ' ')"
if [[ "$MANIFEST_COUNT" -ne "${#FILES[@]}" ]]; then
  echo "ERROR: tarball manifest has $MANIFEST_COUNT entries but ${#FILES[@]} file(s) were requested — a file was silently skipped. Refusing to upload." >&2
  exit 1
fi
if [[ "$MISSING_COUNT" -gt 0 ]]; then
  echo "ERROR: $MISSING_COUNT requested file(s) absent from the tarball — deploy aborted before upload." >&2
  exit 1
fi
echo "✓ tarball completeness: all ${#FILES[@]} requested file(s) present in the manifest"

# --- 2. upload (primary host, auto-fall back to the other) ---
URL=""
USED_HOST=""
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "=== DRY RUN — skipping upload ==="
  URL="<UPLOAD_URL_PLACEHOLDER>"
else
  # primary first, then the other host as fallback
  HOSTS=("$UPLOAD_HOST")
  if [[ "$UPLOAD_HOST" == "catbox" ]]; then HOSTS+=("litterbox"); else HOSTS+=("catbox"); fi
  for h in "${HOSTS[@]}"; do
    echo "=== Uploading to ${h} ==="
    URL="$(upload_to "$h" || true)"
    if [[ -n "$URL" && "$URL" == http* ]]; then
      USED_HOST="$h"
      break
    fi
    echo "  ${h} upload failed (got: $(printf '%.40s' "$URL")...) — trying fallback"
  done
  if [[ -z "$USED_HOST" ]]; then
    echo "ERROR: both catbox and litterbox upload failed" >&2
    exit 1
  fi
  # --- 3. byte-exact verify ---
  curl -s -m 90 -L -o "/tmp/${TAG}-verify.tgz" "$URL"
  VERIFY_SHA="$(hashfile "/tmp/${TAG}-verify.tgz" | awk '{print $1}')"
  if [[ "$VERIFY_SHA" != "$TBZ_SHA" ]]; then
    echo "ERROR: upload not byte-exact (local $TBZ_SHA vs remote $VERIFY_SHA)" >&2
    exit 1
  fi
  echo "Uploaded via ${USED_HOST} + byte-exact verified: $URL"
  echo ""
fi

# --- 3.5. DEV-FALLBACK SENTINELS — single source of truth (v0.22.x) ---
# The instance pre-flight below must refuse a service env still holding the
# dev credentials. Those literals are defined ONCE in
# servers/game-server/src/config/devFallbacks.ts (config.ts re-exports them);
# extract them here so a credentials change can never leave the deploy
# sentinels stale. Fail closed: if the constants can't be read, refuse to
# generate a script that couldn't recognize the dev credentials.
extract_dev_const() {
  sed -n "s/^export const $1 = '\([^']*\)';$/\1/p" \
    servers/game-server/src/config/devFallbacks.ts 2>/dev/null | head -1
}
DEV_JWT_FALLBACK="$(extract_dev_const DEV_JWT_FALLBACK || true)"
DEV_DATABASE_FALLBACK="$(extract_dev_const DEV_DATABASE_FALLBACK || true)"
DEV_REDIS_FALLBACK="$(extract_dev_const DEV_REDIS_FALLBACK || true)"
if [[ -z "$DEV_JWT_FALLBACK" || -z "$DEV_DATABASE_FALLBACK" || -z "$DEV_REDIS_FALLBACK" ]]; then
  echo 'ERROR: could not read the dev-fallback constants from servers/game-server/src/config/devFallbacks.ts — refusing to generate the deploy script (the instance pre-flight must recognize the dev credentials to refuse them).' >&2
  exit 1
fi

# --- 3.5b. JWT pre-flight block (written to a temp file first: the generation
# group below emits the deploy script through one stdout fd, so a nested heredoc
# append would get overwritten by later printf writes — the v0.17.6
# mangled-script incident). Placeholders (__DEV_*__) are spliced to the
# extracted literals after the heredoc closes.
PREFLIGHT_TMP="/tmp/${TAG}-preflight.txt"
cat > "$PREFLIGHT_TMP" <<'PREFLIGHT'
# 4.5/4.6. PRE-FLIGHT — session secret + data stores. Defined as a FUNCTION so
# the sandboxed gate test (test-deploy-gate.sh case L) can exercise the EXACT
# checks the instance runs — behavioral (exit codes), not just textual. A
# service env missing JWT_SECRET / DATABASE_URL — or holding the literal dev
# fallback — is a hard stop (exit 1); REDIS_URL is a loud warning only (Redis
# deliberately degrades to in-memory fanout in single-instance mode).
check_service_env() {
  local srv_env="$1"
  if ! printf '%s\n' "$srv_env" | grep -q '^JWT_SECRET='; then
    echo 'ERROR: JWT_SECRET is not pinned in the running service env — refusing to deploy. Set JWT_SECRET on svc_Y_8aCyzZr5M first (see plans/RELEASES.md runbook).' >&2
    exit 1
  fi
  # Value gate: an empty value makes config.ts fall back to the dev secret, and
  # the literal dev fallback would sign every token with a publicly-known value
  # (the pre-launch rotation retired it — runbook §0b). Either one is a hard stop.
  if printf '%s\n' "$srv_env" | grep -qE '^JWT_SECRET=(__DEV_JWT__)?$'; then
    echo 'ERROR: the running JWT_SECRET is empty or still the DEV FALLBACK (__DEV_JWT__) — refusing to deploy. Rotate it to a real secret first (see plans/RELEASES.md runbook §0b).' >&2
    exit 1
  fi
  echo JWT_SECRET_OK
  # 4.6. DATA-STORE PRE-FLIGHT (v0.22.19) — the same treatment for the data
  # stores. config.ts now refuses to boot against the local-dev fallbacks, so a
  # restart under an unpinned URL would brick the service; refuse the deploy
  # BEFORE the restart instead. DATABASE_URL is a HARD STOP (wrong DB = data
  # integrity); REDIS_URL is a loud WARNING because Redis deliberately degrades
  # to in-memory fanout when absent (single-instance mode is supported).
  if ! printf '%s\n' "$srv_env" | grep -q '^DATABASE_URL='; then
    echo 'ERROR: DATABASE_URL is not pinned in the running service env — refusing to deploy. Set DATABASE_URL on svc_Y_8aCyzZr5M first (the config boot guard now refuses to start without it; see plans/RELEASES.md runbook §0a2).' >&2
    exit 1
  fi
  # Value gate: an empty value makes config.ts fall back to the dev URL, and the
  # literal fallback's credentials are committed in the repo (publicly known) —
  # either one boots against the wrong (dev) database.
  if printf '%s\n' "$srv_env" | grep -qE '^DATABASE_URL=(__DEV_DB__)?$'; then
    echo 'ERROR: the running DATABASE_URL is empty or still the DEV FALLBACK (__DEV_DB__) — refusing to deploy. That URL is the publicly-known dev credential; pin the real production URL (rotate the DB password first if production ever used the dev one; see plans/RELEASES.md runbook §0a2).' >&2
    exit 1
  fi
  if ! printf '%s\n' "$srv_env" | grep -q '^REDIS_URL=' || printf '%s\n' "$srv_env" | grep -qE '^REDIS_URL=(__DEV_REDIS__)?$'; then
    echo 'WARNING: REDIS_URL is missing or still the dev fallback (__DEV_REDIS__) — the new server will run Redis pub/sub in-memory (single-instance mode). Set a real REDIS_URL on svc_Y_8aCyzZr5M to enable cross-instance fanout, or accept in-memory (see plans/RELEASES.md runbook §0a2).' >&2
  fi
  echo DATA_STORES_OK
}

SRV_PID="$(ss -ltnp 2>/dev/null | grep ':3001 ' | grep -oP 'pid=\K[0-9]+' | head -1)"
if [ -z "$SRV_PID" ]; then
  echo 'ERROR: could not find the running service on :3001 — refusing to deploy (cannot verify the session secret).' >&2
  exit 1
fi
SRV_ENV="$(tr '\0' '\n' < "/proc/$SRV_PID/environ" 2>/dev/null || true)"
check_service_env "$SRV_ENV"
PREFLIGHT

# Splice the extracted dev-fallback literals into the pre-flight: the heredoc
# above is quoted, so the __DEV_*__ placeholders are replaced here. deploy.sh
# never carries its own copy of the dev credentials — single source of truth is
# servers/game-server/src/config/devFallbacks.ts.
sed -i.bak \
  -e "s|__DEV_JWT__|$DEV_JWT_FALLBACK|g" \
  -e "s|__DEV_DB__|$DEV_DATABASE_FALLBACK|g" \
  -e "s|__DEV_REDIS__|$DEV_REDIS_FALLBACK|g" \
  "$PREFLIGHT_TMP"
rm -f "$PREFLIGHT_TMP.bak"

# --- 4. generate the deploy script Zo will run ---
{
  printf '%s\n' "set -e"
  printf '%s\n' "# 1. BACKUP — source-only snapshot (node_modules/.git/.turbo/dist excluded; dist is rebuilt)"
  printf '%s\n' "tar -czf /home/workspace/dispatch-hq-backup-pre-${VERSION}.tgz --exclude='node_modules' --exclude='.git' --exclude='.turbo' --exclude='dist' Projects/dispatch-hq"
  printf '%s\n' "echo BACKUP_OK"
  printf '%s\n' "# 2. DOWNLOAD + TRANSFER CHECKSUM VERIFY (tarball sha256, checked ON the instance)"
  printf '%s\n' "cd /home/workspace/Projects/dispatch-hq"
  printf '%s\n' "curl -sL -o /tmp/${TAG}.tgz $URL"
  printf '%s\n' "echo \"$TBZ_SHA  /tmp/${TAG}.tgz\" | sha256sum -c -"
  printf '%s\n' "# 3. EXTRACT over the project"
  printf '%s\n' "tar -xzf /tmp/${TAG}.tgz"
  printf '%s\n' "echo EXTRACT_OK"
  printf '%s\n' "# 4. PER-FILE VERIFY — every changed file's sha256 must match the local manifest"
  printf '%s\n' "cat > /tmp/${TAG}.hashes <<'HASHES'"
  cat "$MANIFEST"
  printf '%s\n' "HASHES"
  printf '%s\n' "cd /home/workspace/Projects/dispatch-hq"
  printf '%s\n' "sha256sum -c /tmp/${TAG}.hashes"
  cat "$PREFLIGHT_TMP"
  printf '%s\n' "# 5. BUILD on the instance (produces the new web bundle + server dist)"
  printf '%s\n' "cd /home/workspace/Projects/dispatch-hq"
  printf '%s\n' "pnpm build"
  printf '%s\n' "echo BUILD_OK"
  printf '%s\n' "# 5.5 POST-BUILD SOURCE RE-VERIFY — the build must NOT have been 'patched' on the"
  printf '%s\n' "#     instance to make it pass. Re-check every changed file's sha256 against the"
  printf '%s\n' "#     manifest right after building; if the agent edited ProfileModal.tsx (or any"
  printf '%s\n' "#     other changed file) mid-deploy, this fails and the instance drifts from main"
  printf '%s\n' "#     silently (the v0.19.0/0.19.1 GuestUpgradeCard 'missing props' incidents)."
  printf '%s\n' "cd /home/workspace/Projects/dispatch-hq"
  printf '%s\n' "sha256sum -c /tmp/${TAG}.hashes"
  printf '%s\n' "echo POSTBUILD_HASH_OK"
  if [[ "$DB_PUSH" -eq 1 ]]; then
    printf '%s\n' "# 6. DB SCHEMA PUSH — sync drizzle schema to the database (additive only)"
    printf '%s\n' "#    Export the PINNED production DATABASE_URL from the running service env so"
    printf '%s\n' "#    drizzle-kit targets production, not the committed dev fallback (drizzle"
    printf '%s\n' "#    config falls back to the dev URL when DATABASE_URL is unset — the wrong-DB"
    printf '%s\n' "#    class that can push schema changes to a stale local dev database)."
    printf '%s\n' "export DATABASE_URL=\"\$(printf '%s\\n' \"\$SRV_ENV\" | sed -n 's/^DATABASE_URL=//p')\""
    printf '%s\n' "cd /home/workspace/Projects/dispatch-hq/servers/game-server"
    printf '%s\n' "pnpm exec drizzle-kit push --force"
    printf '%s\n' "echo DBPUSH_OK"
    printf '%s\n' "cd /home/workspace/Projects/dispatch-hq"
  fi
} > "$DEPLOY"

# --- 5. JSON payload via python3 (robust escaping) ---
command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 required for payload encoding" >&2; exit 1; }
python3 - "$DEPLOY" "$PAYLOAD" <<'PY'
import json, sys
script = open(sys.argv[1]).read()
with open(sys.argv[2], "w") as f:
    json.dump({"input": script}, f)
PY

echo "=== Generated ==="
echo "deploy script: $DEPLOY"
echo "api payload:   $PAYLOAD"
echo ""

# --- 6. print the Zo API command (one copy-paste deploy) ---
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "⚠️  DRY-RUN payload contains a placeholder URL — do NOT run the command below until re-run without --dry-run."
fi
echo "=== Zo API command (copy-paste; set ZO_API_KEY first) ==="
printf '%s\n' \
  'curl -s -m 580 -X POST https://api.zo.computer/zo/ask \' \
  '  -H "Authorization: Bearer ${ZO_API_KEY:?set ZO_API_KEY first}" \' \
  '  -H "Content-Type: application/json" \' \
  "  --data-binary @$PAYLOAD"
echo ""

# --- 7. print the restart message + verification commands ---
echo "=== Then send this restart request to the Zo agent (fresh ZO_RESTART_TS) ==="
echo "Restart the user service svc_Y_8aCyzZr5M (Dispatch HQ, port 3001, entrypoint bun run /home/workspace/Projects/dispatch-hq/servers/game-server/dist/serve-combined.js) using the update_user_service tool with a fresh ZO_RESTART_TS so it picks up the ${VERSION} build. JWT_SECRET must remain pinned in the service env (the deploy pre-flight already verified it) so live sessions survive the restart. Confirm the service is RUNNING on port 3001 and report /health."
echo "⚠️  Keep the service LABEL/slug as 'dispatch-hq' — a version-suffixed label (e.g. dispatch-hq-v0240) changes the public URL to a versioned host and orphans the canonical dispatch-hq-deandrewharris.zocomputer.io (the v0.24.0 hotfix incident). Verify the canonical URL /health returns ${VERSION}, not just a versioned host."
echo ""
echo "=== Verify live ==="
echo "curl -s -m 15 ${LIVE_BASE}/health"
echo "curl -s ${LIVE_BASE}/ | grep -o 'index-[A-Za-z0-9_-]*\\.js' | head -1"
echo "curl -s -o /dev/null -w 'guest: HTTP %{http_code}\\n' -X POST ${LIVE_BASE}/api/auth/guest   # must be 201 — Postgres watchdog (v0.29.4: /health never touches the DB; this is the check that caught ECONNREFUSED 127.0.0.1:5432)"
echo ""

# --- 8. optional: execute the deploy now (retry-until-real-response) ---
# Lesson v0.20.5: the Zo API intermittently swallows deploy requests (HTTP 303
# with 0 bytes, or an empty 200) while still queueing them — a swallowed request
# can still execute, so blindly retrying without a real response risks a double
# deploy. NEVER treat a 303/empty body as submitted. Loop until a genuine JSON
# response arrives (or the cap is hit), report every swallowed attempt, and fail
# loudly if we never get one. Do NOT follow redirects with -L (the 303 would
# convert POST to GET and the API rejects it with 400 "bad redirect method").
#
# Lesson v0.22.7: the API also intermittently rejects a fresh request with HTTP
# 401 "Not enough segments" (a routing quirk) while the identical payload
# succeeds on the next attempt. That 401 is another SWALLOW CLASS — retry it,
# never treat it as an auth failure or a hard stop. classify_zo_response below
# names every non-real response so the log says which swallow class hit.
classify_zo_response() {
  # Usage: classify_zo_response <http_code> <body_file>; echoes a class name.
  local code="$1" body="$2" size=0
  [[ -f "$body" ]] && size="$(wc -c < "$body" 2>/dev/null || echo 0)"
  # A real response is non-empty JSON carrying the agent's answer — the ONLY
  # thing that counts as submitted, whatever the HTTP code on the wire.
  if [[ "$size" -gt 10 ]] && grep -q '"output"' "$body" 2>/dev/null; then
    echo real; return 0
  fi
  # Intermittent Zo routing rejection: 401 + "Not enough segments" in the body.
  if [[ "$code" == "401" ]] && grep -qi 'not enough segments' "$body" 2>/dev/null; then
    echo not-enough-segments; return 0
  fi
  # The v0.20.5 redirect swallow: 303 or an empty 200.
  if [[ "$code" == "303" || ( "$code" == "200" && "$size" -lt 10 ) ]]; then
    echo swallowed-303; return 0
  fi
  if [[ "$size" -lt 10 ]]; then
    echo swallowed-empty; return 0
  fi
  echo swallowed-other; return 0
}

if [[ "$DO_RUN" -eq 1 && "$DRY_RUN" -eq 0 ]]; then
  [[ -n "${ZO_API_KEY:-}" ]] || { echo "ERROR: --run requires ZO_API_KEY in env" >&2; exit 1; }
  echo "=== Executing deploy via Zo API (retry-until-real-response) ==="
  got=0
  attempt=0
  max_attempts="${DEPLOY_RETRIES:-8}"
  out="" code="" size=0
  while [[ "$attempt" -lt "$max_attempts" ]]; do
    attempt=$((attempt + 1))
    out="$(mktemp)"
    code="$(curl -s -o "$out" -w '%{http_code}' -m 580 -X POST https://api.zo.computer/zo/ask \
      -H "Authorization: Bearer $ZO_API_KEY" \
      -H "Content-Type: application/json" \
      --data-binary @"$PAYLOAD" 2>/dev/null || true)"
    size="$(wc -c < "$out" 2>/dev/null || echo 0)"
    class="$(classify_zo_response "$code" "$out")"
    if [[ "$class" == "real" ]]; then
      cat "$out"; echo ""
      echo "✓ Deploy response received on attempt $attempt/$max_attempts."
      got=1
      rm -f "$out"
      break
    fi
    case "$class" in
      not-enough-segments)
        echo "⚠ attempt $attempt/$max_attempts — 401 'Not enough segments' (known intermittent Zo routing rejection — swallow class, NOT a hard stop) — retrying in 10s…"
        ;;
      swallowed-303)
        echo "⚠ attempt $attempt/$max_attempts swallowed (HTTP ${code:-none}, ${size}b — the v0.20.5 303/empty swallow class) — retrying in 10s…"
        ;;
      *)
        echo "⚠ attempt $attempt/$max_attempts swallowed (HTTP ${code:-none}, ${size}b, class=$class) — retrying in 10s…"
        ;;
    esac
    rm -f "$out"
    sleep 10
  done
  if [[ "$got" -eq 0 ]]; then
    echo "ERROR: no real deploy response after $max_attempts attempts — the request may or may not have executed." >&2
    echo "       Check ${LIVE_BASE}/health before retrying; do not fire more blind requests." >&2
    exit 1
  fi
  echo ""
  echo "Verify ${LIVE_BASE}/health reports ${VERSION} before sending the restart request."
fi

# --- 9. post-deploy: itch.io description DRAFT ONLY (never auto-edit) ---
# Drafts the description from the latest release note and prints it. It does
# NOT apply anything — the itch edit API does a full-record replace, so an
# auto-apply here would overwrite the hand-edited Description and Download &
# install instructions on the live page. Apply explicitly with
# scripts/update-itch-description.sh --apply when you mean to.
if [[ "$DO_RUN" -eq 1 && "$DRY_RUN" -eq 0 && "${SKIP_ITCH_UPDATE:-0}" != "1" ]]; then
  echo ""
  echo "=== Post-deploy: itch.io description DRAFT (print-only) ==="
  if scripts/update-itch-description.sh --print; then
    echo "✓ itch.io description drafted (not applied — run with --apply to edit the page)."
  else
    echo "⚠️  itch.io description draft failed (non-fatal) — run it manually:"
    echo "    scripts/update-itch-description.sh"
  fi
fi

# --- 10. post-deploy: itch.io desktop build stamp (v0.34.1) ---
# The desktop shells load the LIVE web app, so the game files never change on
# a release — but the itch build list must still be re-stamped at the current
# game version, or the page shows a stale version (the 0.33.0 → 0.34.0 lag).
# Runs after EVERY successful --run deploy when butler + creds + artifacts
# exist. Skip with SKIP_ITCH_STAMP=1; override the project with ITCH_TARGET
# (the page slug is agreatgame/dispatch-hq, NOT the checkout owner).
if [[ "$DO_RUN" -eq 1 && "$DRY_RUN" -eq 0 && "${SKIP_ITCH_STAMP:-0}" != "1" ]]; then
  ITCH_TARGET="${ITCH_TARGET:-agreatgame/dispatch-hq}"
  echo ""
  echo "=== Post-deploy: stamp itch.io desktop builds at v${VERSION} (${ITCH_TARGET}) ==="
  if ! command -v butler >/dev/null 2>&1 || [[ ! -f "$HOME/Library/Application Support/itch/butler_creds" ]]; then
    echo "⚠️  butler (or its credentials) not found — skipping the itch build stamp."
    echo "    Re-stamp manually from a machine with butler:"
    echo "    scripts/publish-itch.sh ${ITCH_TARGET} --push"
  elif [[ -z "$(ls dist/mac/DispatchHQ-*-universal.dmg 2>/dev/null | head -1)" ]]; then
    echo "⚠️  desktop artifacts not found in dist/ — skipping the itch build stamp."
    echo "    Build them first (bash apps/desktop/scripts/build-release.sh all), then:"
    echo "    scripts/publish-itch.sh ${ITCH_TARGET} --push"
  else
    if scripts/publish-itch.sh "${ITCH_TARGET}" --push; then
      echo "✓ itch desktop builds stamped at v${VERSION}"
    else
      echo "ERROR: itch build stamp failed — the itch build list is stale." >&2
      echo "       Run it manually: scripts/publish-itch.sh ${ITCH_TARGET} --push" >&2
      exit 1
    fi
  fi
fi
