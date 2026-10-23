#!/usr/bin/env bash
# ============================================================
# update-itch-description.sh — keep the itch.io page in sync
# with the latest Dispatch HQ release note.
# ============================================================
# Runs after every deploy (deploy.sh calls this once the release is live).
# Behavior is safe by default:
#   - drafts the itch.io description from the LATEST release note
#     (apps/web/src/data/releaseNotes.ts) and prints it
#   - if a FULL itch API key is available (ITCH_API_KEY env or
#     ~/.config/itch/api_key), APPLIES the edit to the page
#   - otherwise prints the exact apply command for you to run
#
# The butler key (wharf-scoped) can NOT edit the page — it will fall through
# to the print-only path. Use a full key from
# https://itch.io/user/settings/api-keys -> Generate new API key.
#
# Usage:
#   scripts/update-itch-description.sh            # DRAFT ONLY (never edits the page)
#   scripts/update-itch-description.sh --apply    # apply, with ITCH_API_KEY set
#   scripts/update-itch-description.sh --print    # draft only, never apply
#
# SAFETY: This script DRAFTS by default. It only edits the live page when you
# pass --apply explicitly AND a full API key is present. The itch edit API does
# a full-record replace, so applying overwrites EVERYTHING the draft doesn't
# include (Description, Download & install instructions, tags, etc.) — never
# auto-apply from a deploy hook.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

FORCE_PRINT=0
DO_APPLY=0
for arg in "$@"; do
  case "$arg" in
    --print) FORCE_PRINT=1 ;;
    --apply) DO_APPLY=1 ;;
  esac
done

MANAGE="$SCRIPT_DIR/itch-manage.sh"
NOTE_TS="apps/web/src/data/releaseNotes.ts"

if [[ ! -f "$NOTE_TS" ]]; then
  echo "ERROR: release notes not found at $NOTE_TS" >&2
  exit 1
fi

echo "=== update-itch-description — draft from the latest release note ==="

# --- draft the description body via itch-manage.sh's release-checklist ---
# reuse the same node parser that itch-manage.sh uses by extracting the draft
# file path from its output
MANAGE_OUT="$("$MANAGE" release-checklist 2>&1)"
DRAFT="$(echo "$MANAGE_OUT" | sed -n 's/^draft file: //p' | head -1)"

if [[ -z "$DRAFT" || ! -f "$DRAFT" ]]; then
  echo "ERROR: could not draft the description. Output:" >&2
  echo "$MANAGE_OUT" >&2
  exit 1
fi

# --- short_text: the release note title, capped at itch's 140 chars ---
SHORT_TEXT="$(echo "$MANAGE_OUT" | sed -n 's/^short_text: //p' | head -1 | cut -c1-140)"
TAGS="simulation,strategy,emergency,dispatch"
# Developers/credits line on the page (edit field p_developers). Override with
# ITCH_DEVELOPERS=<name> if you want something different than the default.
DEVELOPERS="${ITCH_DEVELOPERS:-Dispatch HQ Team}"

echo ""
echo "--- drafted description (game release) ---"
sed 's/^/  /' "$DRAFT" || true

# --- apply (if a usable key exists and we're not in forced-print) ---
KEY_FILE="${ITCH_API_KEY_FILE:-$HOME/.config/itch/api_key}"
KEY=""
if [[ -n "${ITCH_API_KEY:-}" ]]; then
  KEY="$ITCH_API_KEY"
elif [[ -f "$KEY_FILE" ]]; then
  KEY="$(cat "$KEY_FILE" | tr -d '[:space:]')"
fi

APPLY=0
if [[ "$DO_APPLY" -eq 1 && "$FORCE_PRINT" -eq 0 && -n "$KEY" ]]; then
  # wharf-scoped (butler) keys can't edit the page — probe with verify
  SCOPE_JSON="$(curl -s -m 20 -X GET "https://itch.io/api/1/$KEY/credentials/info" -H "Authorization: Bearer $KEY" 2>/dev/null || true)"
  # Full keys report NO scopes array at all; wharf keys report scopes:["wharf"].
  if ! grep -q '"wharf"' <<<"$SCOPE_JSON" || grep -qE '"game:edit"|"game:view"' <<<"$SCOPE_JSON"; then
    APPLY=1
  else
    echo ""
    echo "⚠️  The found itch API key is wharf-scoped (build pushes only) — can't edit the page."
    echo "    Generate a full key at https://itch.io/user/settings/api-keys and set ITCH_API_KEY."
  fi
fi

if [[ "$APPLY" -eq 1 ]]; then
  echo ""
  echo "--- applying page edit (full API key present) ---"
  echo "  developers: $DEVELOPERS"
  "$MANAGE" edit \
    "short_text=$SHORT_TEXT" \
    "description=@$DRAFT" \
    "tags=$TAGS" \
    "p_developers=$DEVELOPERS"
  echo "✓ itch.io page updated (description + developers + tags)."
else
  echo ""
  echo "--- not applied. To apply manually (copy-paste): ---"
  echo "  ITCH_API_KEY=<full-api-key> scripts/update-itch-description.sh --apply"
  echo ""
  echo "  WARNING: --apply does a FULL-record edit — it overwrites the Description",
  echo "  and Download & install instructions on the live page. Review the draft",
  echo "  above first, and only apply when you mean to replace those fields."
fi

rm -f "$DRAFT"
