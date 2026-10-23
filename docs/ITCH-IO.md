# Dispatch HQ — itch.io Ops

Single reference for everything that touches the itch.io presence of Dispatch HQ.
If you are releasing a new version, the 5-minute checklist at the bottom is all you need.

## The page

| Field | Value |
|---|---|
| **Page URL** | https://agreatgame.itch.io/dispatch-hq |
| **Account / user** | `agreatgame` (butler target: `agreatgame/dispatch-hq`) |
| **Game ID** | `4854287` (used by the embed widget + `itch-manage.sh`) |
| **Kind of game** | **Downloadable** (desktop builds via butler channels) |
| **Classification** | simulation / strategy |
| **Cover** | `docs/promo/itch-cover-630x500.jpg` (exact 630×500, 68 KB) |
| **Banner** | `docs/promo/itch-banner-900x450.jpg` (76 KB) |

The web version is **FREE** — the page sells the desktop apps and (soon)
membership/coins, so the page description should lead with: web is free at
https://dispatch-hq.onrender.com, desktop loads the live game
and needs an internet connection.

## Channels & current builds

Three butler channels, one per platform. The desktop shell is a thin Electron
wrapper that loads the live game on every launch — players always get the
latest game version, so re-downloading the app is never needed.

| Channel | Artifact (in `dist/`) | Built by |
|---|---|---|
| `mac` | `DispatchHQ-*-universal.dmg` (+ zip) | `apps/desktop/scripts/build-release.sh` |
| `windows` | `DispatchHQ-*-x64-setup.exe` | 〃 |
| `linux` | `DispatchHQ-*-x86_64.AppImage` | 〃 |

As of v0.29.6: all three channels live with build `--userversion 0.29.6`
(builds #1884829 / #1884832 / #1884833 for v0.29.4; re-pushed since).

## Re-pushing builds (the common case)

The shell artifacts are rebuilt and pushed with two commands:

```bash
# 1. Rebuild all three platforms (bumps the shell version if you edit package.json first)
bash apps/desktop/scripts/build-release.sh all      # outputs to dist/ + SHA256SUMS.txt

# 2. Push to itch (game version read automatically from releaseNotes.ts)
scripts/publish-itch.sh agreatgame/dispatch-hq --preview   # diff vs live, no upload
scripts/publish-itch.sh agreatgame/dispatch-hq --push      # real upload
```

Key facts:

- `--userversion` is the **game** version (from `apps/web/src/data/releaseNotes.ts`),
  not the shell version, so the itch build list reads like game releases.
- The `--push --dry-run` flag lists files butler would send without uploading.
- With no mode flag the script just prints the exact commands (safe default).
- Requires `butler` on PATH (`brew install butler`, or the itch app v26.12+
  bundles it) and one-time `butler login`. The script's auth guard checks
  butler's default creds file at `~/Library/Application Support/itch/butler_creds`.
- Pushes are **incremental** — butler diffs and uploads only the delta, so
  re-releases are near-instant.
- `dist/` is gitignored; artifacts stay local, only scripts/docs are committed.
- **Signing:** the current build is unsigned (ad-hoc) — no Developer ID /
  Authenticode certs configured. Gatekeeper and SmartScreen warn on first
  launch; the Download & install instructions on the page cover the
  right-click → Open / More info → Run anyway workarounds.

## Page management (text fields)

Build pushes use butler's wharf-scoped key. Editing the **page** (title, short
text, description, tags) needs a **full** itch API key:

| Key | Scope | Used by |
|---|---|---|
| butler key (`~/Library/Application Support/itch/butler_creds`) | `wharf` only — build pushes | `publish-itch.sh` |
| **full API key** (https://itch.io/user/settings/api-keys → Generate new API key) | unscoped — `game:edit`, `game:view`, … | `itch-manage.sh` |

**Never commit the full key.** Pass per-command or write it to `~/.config/itch/api_key`.

```bash
ITCH_API_KEY=<key> scripts/itch-manage.sh status          # views / downloads / published
ITCH_API_KEY=<key> scripts/itch-manage.sh edit "short_text=..." "tags=simulation,strategy"
ITCH_API_KEY=<key> scripts/itch-manage.sh verify          # what a key can do
```

API limits (verified against itch's reference):
- **No endpoint for cover/screenshots** — images upload only via the web UI.
- `game:edit` exists on the legacy host (`itch.io/api/1/<key>/...`); the modern
  `api.itch.io` has no edit endpoint.
- A wharf key answering `api key does not permit ...` on page endpoints is
  expected, not a bug.

**⚠️ `game:edit` is a FULL-record replace.** Any field you don't send is reset
to its default (empty text / false / 0) — it does NOT merge. A partial edit
(e.g. only `short_text=...`) silently **blanks the description, install
instructions, and tags**. `itch-manage.sh edit` defends against this by always
re-sending the canonical copy from `docs/promo/itch-*.md` for every text field
(short_text, description, `dwl_instructions`, tags, `p_developers`).

**Field names** (verified by probing the edit endpoint):
- `short_text`, `description`, `tags`, `p_developers` — editable via the API.
- `dwl_instructions` — the **"Download & install instructions"** box. Editable
  via the API, but it only renders on the download/claim page (not the public
  page and not the API read-back), so there is no way to verify it landed via
  the API — confirm in the web edit form.
- **Platform flags** (`p_windows` / `p_osx` / `p_linux`, shown as `traits` in the
  modern API) are **NOT editable via the API** — the edit endpoint silently
  ignores them in every format. A butler channel re-push does NOT re-derive
  them either. Set those via the web edit form (Details → platform checkboxes).
- The description renders **HTML, not Markdown** — use `<h2>` / `<strong>` /
  `<ul>` tags, not `**` / `##`.

## Promo codes

Codes live in the DB (seeded via `servers/game-server/src/db/seed.ts` and the
admin redemption log), not in the itch page — but itch launches are where
players hear about them, so the announcement flow is coordinated here.

| Code | Purpose | Limit | Status |
|---|---|---|---|
| `DHQ-LAUNCH` | Welcome Launch — 10,000 credits + 500 XP | 500 | seeded, live |
| `DHQ-E9P4-8RX7` | Limited bonus code | 25 | live |

As of the v0.29.5 launch note: both active, 2/500 and 2/25 used. All 69 players
got a durable inbox note ("📣 Dispatch HQ is FREE") announcing the free web
version, the upcoming membership + coins, and both codes.

When codes change or a new one drops:
1. Add it to `servers/game-server/src/db/seed.ts` (idempotent by code).
2. After deploy, run `curl -s -X POST https://dispatch-hq.onrender.com/api/seed`
   (per `plans/RELEASES.md` §4 — seeding never duplicates codes or resets `usedCount`).
3. Announce via the admin broadcast or direct inbox rows (the v0.29.5 launch
   inserted one durable inbox row per player) and mention the codes in the itch
   description + release note.

## Image assets (`docs/promo/`)

All under itch's 3 MB per-image cap. Masters are the `.png`s; ship the `.jpg`s.

| File | Use on itch | Size | Limit |
|---|---|---|---|
| `itch-cover-630x500.jpg` | Cover image (exact recommended size) | 68 KB | 3 MB ✓ |
| `itch-banner-900x450.jpg` | Banner / header | 76 KB | 3 MB ✓ |
| `dispatch-hq-poster.jpg` | Screenshot / gallery (2560×1440) | 588 KB | 3 MB ✓ |
| `dispatch-hq-social-square.jpg` | Socials / sharing (2048×2048) | 972 KB | 3 MB ✓ |
| `dispatch-hq-poster.png` | Master (print) | 4.5 MB | n/a |
| `dispatch-hq-social-square.png` | Master | 6.7 MB | n/a |

Notes:
- The **square master has a baked-in clipped "Q"** in "DISPATCH HQ" (title
  bleeds to the canvas edge) — the cover/banner are cropped from the *poster*
  and show the full text. Don't regenerate the square from the square.
- itch cover max is 3840×2160 / 3 MB; screenshots 3 MB each. JPEG was safe to
  use because neither source has an alpha channel.

## Embed widget (main menu)

`apps/web/src/components/MainMenu.tsx` renders the itch embed ("Play on itch.io"
section) with `https://itch.io/embed/4854287`, scaled to fit the 320px menu
column (`transform: scale(0.58)`). The itch page text below it announces the
free web version + upcoming membership/coins.

- Changing the embed iframe URL is a web change → requires a **deploy**
  (it ships in the web bundle), and `scripts/check-external-hosts.sh` has an
  itch.io allowlist entry that gates deploys.
- itch.io is the ONLY third-party host allowed in the game (zero-dep policy).

## 5-minute release checklist

After the game release is built and deployed:

1. **Rebuild the shells** (only needed if the wrapper changed): `bash apps/desktop/scripts/build-release.sh all`
2. **Preview**: `scripts/publish-itch.sh agreatgame/dispatch-hq --preview`
3. **Push**: `scripts/publish-itch.sh agreatgame/dispatch-hq --push` (incremental, near-instant)
4. **Page copy** (if the release is notable): `ITCH_API_KEY=<key> scripts/itch-manage.sh edit "short_text=..."` and update the description in the web UI if needed
5. **Images**: upload new `docs/promo/*.jpg` in the web UI only when art changed
6. **Codes**: if a new code shipped, `curl -s -X POST https://dispatch-hq.onrender.com/api/seed` and announce via inbox
7. **Devlog** (if the release is notable): copy the launch / membership post from the templates below into the web UI — no API endpoint exists for devlogs
8. **Verify**: open https://agreatgame.itch.io/dispatch-hq → the channel files show the new `--userversion`

## Devlog post templates

The itch devlog is web-UI only (no API endpoint — confirmed against the
reference and by probing; it's a community feature request since 2022), so
posts are copy-pasted into https://agreatgame.itch.io/dispatch-hq/devlog.
Update the placeholders (date, codes, links) per release.

### Launch post (new players, itch page + devlog)

```
🚨 Dispatch HQ is live on itch.io — and the web version is FREE

Command the chaos. Save the city.

Dispatch HQ is a real-time emergency-dispatch simulation. Build fire, police,
and EMS stations on a real-road city map, recruit and train units, then
respond to dynamic missions as they light up the city — structure fires,
cardiac arrests, pursuits, hazmat incidents, and more, all unfolding in real
time with actual road routing.

Three ways to play:
- 🌐 Web (FREE, playable now) — no download, no account required. Jump in as
  a guest at https://dispatch-hq.onrender.com and start your
  campaign in minutes.
- 🖥️ Desktop (macOS / Windows / Linux) — grab the installer right here on
  this page. The desktop app loads the live game, so every launch is the
  latest version — no re-downloading for updates. Needs an internet connection.

Launch promo codes — redeem in-game from your profile panel:
- 🎁 DHQ-LAUNCH — Welcome Launch pack: 10,000 credits + 500 XP (500 uses)
- ⚡ DHQ-E9P4-8RX7 — Limited bonus code (only 25 uses — first come, first served)

What's coming:
- 📅 October 27 — full platform rollout (the "coming soon" countdown in-game
  flips to buy links automatically on launch day)
- 💎 A membership program and coin purchases for gamers — a future update,
  so stay tuned

Everything you build carries over across devices when you create an account —
guest progress lives on your device, but linking an account takes your city
with you anywhere.

Start your campaign now — it's free, it's live, and the city needs you. 🚒🚓🚑
```

### Membership & coins post (monetization transparency)

```
💎 Membership & Coins — what's coming to Dispatch HQ

You asked, we're building it. Here's the honest roadmap for how Dispatch HQ
stays free while we add optional support for players who want to go deeper.

The web game stays FREE. Always. Every core feature — building stations,
recruiting and training units, dispatching to missions across real cities,
forming alliances, seasonal events — remains free for everyone, forever. No
paywalls on missions, no "energy" systems, no content gated behind a
subscription.

Membership (planned $9.99/month) — an optional commander tier for the
dedicated:
- 2× credits on every payout — grow your fleet and expand to new cities faster
- 2× training speed — your units learn, level, and unlock better capabilities
twice as fast
- A membership badge on your profile and in alliance chat
- The numbers above are the current design (they're literally in the game's
economy config — see PREMIUM in packages/shared/src/constants/economy.ts) —
final pricing and perks may shift before launch

Coins — a separate optional currency for cosmetics and convenience, never for
power:
- Station skins and unit liveries — make your fleet yours
- Commander titles and profile flair
- Convenience items like instant relocations (only if you'd rather not grind)
- Nothing that buys a competitive advantage. No pay-to-win, ever.

What we're NOT doing (so you know the guardrails):
- No ads. Ever.
- No loot boxes or gambling-style mechanics
- No selling gameplay power — coins buy cosmetics and convenience only
- No locking existing free content behind payment

Timeline — targeting a future update after the October 27 full-platform
launch. Both promo codes from launch are still live in-game:
- 🎁 DHQ-LAUNCH — 10,000 credits + 500 XP
- ⚡ DHQ-E9P4-8RX7 — limited bonus code (25 uses)

Feedback wanted. If membership perks or coin items feel too strong or too
weak, tell us in the comments — the economy is still being tuned, and player
input is what makes the balance right.

Until then — the city needs you. 🚒🚓🚑
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `invalid target (bad user)` | Wrong user slug in the target — the real one is `agreatgame` |
| `invalid game` | Right user, wrong game slug — must be exactly `dispatch-hq` |
| `ERROR: butler is not logged in` despite `butler login` | Stale script auth guard — the guard now checks the creds file directly; `butler status` is **not** an auth probe |
| `api key does not permit ...` on page endpoints | wharf-scoped key — get a full key from https://itch.io/user/settings/api-keys |
| Image "greater than 3MB" | Use the `.jpg` files in `docs/promo/`, never the `.png` masters |

Last updated: 2026-08-16 (v0.29.7)
