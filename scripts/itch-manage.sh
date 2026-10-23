#!/usr/bin/env bash
# ============================================================
# itch-manage.sh — manage the Dispatch HQ itch.io page via API
# ============================================================
# Build pushes (mac/windows/linux) live in publish-itch.sh and use butler's
# wharf-scoped key. THIS script manages the PAGE itself — status/stats and
# editing fields (title, short text, description, tags, …) — which needs a
# FULL itch.io API key (unscoped). Generate one at:
#
#   https://itch.io/user/settings/api-keys   -> "Generate new API key"
#
# The key is passed via the ITCH_API_KEY env var (or a file, see below).
# NEVER commit the key. The game ID (4854287) matches the embed widget.
#
# Usage:
#   ITCH_API_KEY=<key> scripts/itch-manage.sh status
#   ITCH_API_KEY=<key> scripts/itch-manage.sh edit "short_text=..." "description=..."
#   ITCH_API_KEY=<key> scripts/itch-manage.sh verify
#
# Commands:
#   status   game stats (views / downloads / purchases / published state)
#   edit     apply "field=value" args to the page (game:edit)
#   verify   check the key's scopes and which endpoints it can reach
#
# The itch API has NO endpoint for uploading cover images or screenshots —
# those are web-UI uploads only (use the sized JPGs in docs/promo/).
# ============================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GAME_ID="4854287"

# --- key resolution: env var, or the key file, or butler's creds ---
KEY_FILE="${ITCH_API_KEY_FILE:-$HOME/.config/itch/api_key}"
KEY=""
if [[ -n "${ITCH_API_KEY:-}" ]]; then
  KEY="$ITCH_API_KEY"
elif [[ -f "$KEY_FILE" ]]; then
  KEY="$(cat "$KEY_FILE" | tr -d '[:space:]')"
elif [[ -f "$HOME/Library/Application Support/itch/butler_creds" ]]; then
  KEY="$(cat "$HOME/Library/Application Support/itch/butler_creds" | tr -d '[:space:]')"
fi

if [[ -z "$KEY" ]]; then
  echo "ERROR: no itch API key found." >&2
  echo "  Set ITCH_API_KEY=<key> (generate at https://itch.io/user/settings/api-keys)," >&2
  echo "  or write the key to $KEY_FILE" >&2
  exit 1
fi

CMD="${1:-status}"
shift || true

api() { # $1 = method, $2 = path, rest = form fields (one --data-urlencode per field)
  local method="$1" path="$2"; shift 2
  local args=(-s -m 30 -X "$method" "https://itch.io/api/1/$KEY$path" -H "Authorization: Bearer $KEY")
  for f in "$@"; do
    args+=(--data-urlencode "$f")
  done
  curl "${args[@]}"
}

echo "=== itch.io page manager — game $GAME_ID ==="
case "$CMD" in
  release-checklist)
    # Draft the itch.io page description from the LATEST release note and print
    # the exact edit command to apply it (no API key needed — pure local draft).
    # Usage: scripts/itch-manage.sh release-checklist
    NOTE_TS="$REPO_ROOT/apps/web/src/data/releaseNotes.ts"
    if [[ ! -f "$NOTE_TS" ]]; then
      echo "ERROR: release notes not found at $NOTE_TS" >&2
      exit 1
    fi
    DRAFT="$(mktemp /tmp/itch-release-draft-XXXXXX)"
    NODE_DRAFT="$(mktemp /tmp/itch-draft-XXXXXX)"
    cat > "$NODE_DRAFT" <<'NODE_DRAFT_EOF'
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
// Latest release note = the first object in RELEASE_NOTES.
const start = src.indexOf('RELEASE_NOTES: ReleaseNote[] = [');
const head = start >= 0 ? src.slice(start) : src;
const m = head.match(/\{\s*version: '([0-9.]+)',\s*date: '([^']+)',\s*title: '([^']+)',\s*items: \[([\s\S]*?)\n\s*\],/);
if (!m) { console.error('could not parse the latest release note'); process.exit(1); }
const version = m[1], date = m[2], title = m[3];
const items = m[4]
  .split('\n')
  .map((l) => l.replace(/^\s*['"]|['"],?\s*$/g, ''))
  .map((l) => l.trim())
  .filter(Boolean);
console.log('=== itch.io page — release checklist draft (game v' + version + ', ' + date + ') ===');
console.log('title:      Dispatch HQ — v' + version);
console.log('short_text: ' + title.slice(0, 140));
console.log('tags:       simulation,strategy,emergency,dispatch');
console.log('');
console.log('description:');
console.log('  Build. Recruit. Dispatch. Save the city.');
console.log('');
console.log('  v' + version + ' — ' + title);
for (const it of items) console.log('  • ' + it.slice(0, 160));
console.log('');
console.log('  Free to play in your browser — the desktop app (macOS, Windows, Linux)');
console.log('  loads the live game and needs an internet connection.');
// Write the description body to the draft file.
const body = [
  'Build. Recruit. Dispatch. Save the city.',
  '',
  'v' + version + ' — ' + title,
  ...items.map((it) => '• ' + it.slice(0, 160)),
  '',
  'Free to play in your browser — the desktop app (macOS, Windows, Linux) loads the live game and needs an internet connection.',
].join('\n');
fs.writeFileSync(process.argv[3], body + '\n');
console.log('');
console.log('draft file: ' + process.argv[3]);
NODE_DRAFT_EOF
    node "$NODE_DRAFT" "$NOTE_TS" "$DRAFT"
    rm -f "$NODE_DRAFT"
    echo ""
    echo "Apply it with (or pipe the file body into edit):"
    echo "  ITCH_API_KEY=<full-api-key> scripts/itch-manage.sh edit \"short_text=<title up to 140 chars>\" \"description=@$DRAFT\" \"tags=simulation,strategy,emergency,dispatch\""
    echo ""
    echo "Review the draft above; when it looks right, run that command. Then upload new"
    echo "cover/screenshots in the web UI (docs/promo/*.jpg) — the itch API has no image endpoint."
    ;;
  verify)
    echo "--- credentials scopes ---"
    SCOPE_JSON="$(api GET /credentials/info)"
    echo "$SCOPE_JSON" | python3 -m json.tool 2>/dev/null || echo "$SCOPE_JSON"
    if ! grep -qE '"game:edit"|"game:view"' <<<"$SCOPE_JSON" && grep -q '"wharf"' <<<"$SCOPE_JSON"; then
      echo ""
      echo "⚠️  This key is wharf-scoped (build pushes only). Page management needs a FULL key:" >&2
      echo "    https://itch.io/user/settings/api-keys  ->  Generate new API key" >&2
    fi
    ;;
  status)
    echo "--- page stats (from my-games) ---"
    api GET /my-games | python3 -c "
import json, sys
d = json.load(sys.stdin)
if 'errors' in d:
    print('ERROR:', d['errors']); sys.exit(1)
for g in d.get('games', []):
    if g.get('id') == $GAME_ID or str(g.get('id')) == '$GAME_ID':
        print('title:        ', g.get('title'))
        print('short_text:   ', (g.get('short_text') or '')[:90])
        print('views:        ', g.get('views_count'))
        print('downloads:    ', g.get('downloads_count'))
        print('purchases:    ', g.get('purchases_count'))
        print('published:    ', g.get('published'))
        print('classification:', g.get('classification'))
        print('url:          ', g.get('url'))
        print('traits:       ', ','.join(g.get('traits') or []))
        sys.exit(0)
print('game', '$GAME_ID', 'not found in your games')
" 2>&1 || api GET /my-games | head -c 400
    ;;
  edit)
    if [[ $# -eq 0 ]]; then
      echo "usage: ITCH_API_KEY=<key> scripts/itch-manage.sh edit \"field=value\" ..." >&2
      echo "  e.g. edit \"short_text=Build, recruit, dispatch — now on itch.io\" \"tags=simulation,strategy\"" >&2
      echo "  Multi-line fields: use description=@/path/to/file (the file body is sent verbatim)." >&2
      exit 1
    fi
    echo "--- applying page edit ---"
    # The edit API validates the FULL game record, so fetch the current values
    # and merge the requested overrides onto them.
    CURRENT="$(api GET /game/$GAME_ID 2>/dev/null || echo '{}')"
    # baseline: required fields (from the record where present, defaults otherwise)
    BASE_TITLE="$(printf '%s' "$CURRENT" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("game",{}); print(d.get("title","Dispatch HQ"))' 2>/dev/null || echo 'Dispatch HQ')"
    BASE_SLUG="$(printf '%s' "$CURRENT" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("game",{}); print(d.get("url","/dispatch-hq").rstrip("/").split("/")[-1] or "dispatch-hq")' 2>/dev/null || echo 'dispatch-hq')"
    BASE_TYPE="$(printf '%s' "$CURRENT" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("game",{}); print(d.get("type","default"))' 2>/dev/null || echo 'default')"
    BASE_MIN_PRICE="$(printf '%s' "$CURRENT" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("game",{}); print(d.get("min_price",0))' 2>/dev/null || echo '0')"
    # Preserve platform flags (the edit API silently resets absent ones to false).
    P_WINDOWS="$(printf '%s' "$CURRENT" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("game",{}); print("true" if d.get("p_windows") else "false")' 2>/dev/null || echo 'false')"
    P_OSX="$(printf '%s' "$CURRENT" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("game",{}); print("true" if d.get("p_osx") else "false")' 2>/dev/null || echo 'false')"
    P_LINUX="$(printf '%s' "$CURRENT" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("game",{}); print("true" if d.get("p_linux") else "false")' 2>/dev/null || echo 'false')"
    P_ANDROID="$(printf '%s' "$CURRENT" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("game",{}); print("true" if d.get("p_android") else "false")' 2>/dev/null || echo 'false')"
    # Parse overrides into parallel arrays (bash 3.2-safe: no associative
    # arrays). @file values are expanded to file contents here, once.
    onames=() ovals=()
    for kv in "$@"; do
      name="${kv%%=*}" value="${kv#*=}"
      if [[ "$value" == @* ]]; then
        f="${value#@}"
        if [[ ! -f "$f" ]]; then
          echo "ERROR: $name file not found: $f" >&2
          exit 1
        fi
        value="$(cat "$f")"
      fi
      onames+=("$name") ovals+=("$value")
    done
    val() { # $1 = field name, $2 = default
      want="$1" def="$2"
      for ((i = 0; i < ${#onames[@]}; i++)); do
        [[ "${onames[$i]}" == "$want" ]] && { printf '%s' "${ovals[$i]}"; return; }
      done
      printf '%s' "$def"
    }
    # Required baseline fields (always sent so the API doesn't reject the edit).
    # Platform flags are read from the current record — the API resets absent
    # ones to false, which would silently disable the desktop downloads.
    args=(
      "game[title]=$BASE_TITLE"
      "game[slug]=$BASE_SLUG"
      "game[published]=published"
      "game[payment_mode]=free"
      "game[type]=$BASE_TYPE"
      "game[user_classification]=game"
      "game[release_status]=released"
      "game[community_type]=none"
      "game[min_price]=$BASE_MIN_PRICE"
      "game[p_windows]=$P_WINDOWS"
      "game[p_osx]=$P_OSX"
      "game[p_linux]=$P_LINUX"
      "game[p_android]=$P_ANDROID"
    )
    # Canonical page copy lives in the repo so a PARTIAL edit can never blank
    # the page. The legacy game:edit endpoint is a FULL-record replace: any
    # field we don't send is reset to its default (empty text, false bool, 0).
    # So every edit re-sends the known-good content for the text fields.
    CANON_SHORT_TEXT='"Command the chaos."'
    CANON_DESC_FILE="$REPO_ROOT/docs/promo/itch-description.md"
    CANON_INST_FILE="$REPO_ROOT/docs/promo/itch-install-instructions.md"
    CANON_TAGS="simulation,strategy,emergency,dispatch"
    CANON_DEVELOPERS="Dispatch HQ Team"

    # Optional overrides: default to the canonical repo copy when not provided.
    # NOTE: platform flags (p_windows/p_osx/p_linux) are NOT editable here —
    # the endpoint silently ignores them. Set those via the web edit form.
    for name in title slug short_text description tags p_developers dwl_instructions; do
      v="$(val "$name" "")"
      case "$name" in
        short_text)       [[ -z "$v" ]] && v="$CANON_SHORT_TEXT" ;;
        description)      [[ -z "$v" ]] && v="$(cat "$CANON_DESC_FILE")" ;;
        dwl_instructions) [[ -z "$v" ]] && v="$(cat "$CANON_INST_FILE")" ;;
        tags)             [[ -z "$v" ]] && v="$CANON_TAGS" ;;
        p_developers)     [[ -z "$v" ]] && v="$CANON_DEVELOPERS" ;;
      esac
      [[ -n "$v" ]] && args+=("game[$name]=$v")
    done
    api POST /game/$GAME_ID/edit "${args[@]}" | python3 -m json.tool 2>/dev/null || true
    echo ""
    echo "edit response above — success means: { \"success\": true }"
    ;;
  *)
    echo "unknown command: $CMD (expected: status | edit | verify)" >&2
    exit 1
    ;;
esac
