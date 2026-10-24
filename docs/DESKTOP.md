# Dispatch HQ — Desktop App (DMG) & Updates

`apps/desktop` is the **Electron** desktop app for macOS, Windows, and Linux.
Since **v0.4.0** it is a real bundled PC build, not a web wrapper: the full
game client is compiled and shipped inside the app. Accounts, saves, chat,
and multiplayer still run on the production server — Dispatch HQ is a live
multiplayer game — but the client itself is installed on the player's
machine like any other PC game.

## Architecture — how the bundled game is served

The game client (`apps/web`) is built in a dedicated **desktop mode**
(`apps/desktop/scripts/stage-web.mjs`) that bakes in the production
endpoints — `VITE_API_URL=https://dispatch-hq.onrender.com/api` and
`VITE_WS_URL=wss://dispatch-hq.onrender.com/ws` — and staged into
`apps/desktop/web-dist/`, which electron-builder carries as a resource.
(The normal web build is untouched: Render still builds it with the
same-origin `/api` default and an origin-derived WebSocket URL.)

Serving the bundle has one non-obvious constraint: the production server
issues **SameSite=Strict** auth cookies and CORS-allowlists credentialed
calls to its own origin only. A page loaded from a custom `app://` scheme,
`file://`, or a loopback port could never send those cookies, so login
would be impossible without changing the server. The desktop app therefore
keeps `https://dispatch-hq.onrender.com` as the **document origin** and
intercepts that host's https traffic in the main process
(`protocol.handle` in `src/main.ts`):

- document + static requests are answered from the bundled `web-dist`
  (with SPA fallback to `index.html`),
- the server's data paths (`/api`, `/health`, `/tiles`, `/routing`,
  `/geocode`) pass through to the real server via `net.fetch` on the app
  session, so session cookies flow exactly as in a browser,
- traffic to any other host passes through untouched,
- page navigation stays pinned to the game origin; everything external
  opens in the system browser.

If the server doesn't answer at launch, the app shows a **bundled status
page** (`assets/offline.html`) instead of a dead window. Because the
production server sleeps when idle and can take a minute to wake, the
page opens in a "waking" state and the app keeps probing `/health` for
up to ~2 minutes, loading the game by itself the moment the server
answers. Only if the wake window runs out does the page switch to a
can't-reach state with Retry (which restarts the wake loop) and an "open
web version" action. Setting `DHQ_APP_URL` (e.g. to a local dev
server) restores the pre-0.4.0 behavior of simply loading that URL
remotely, with no interception.

One migration note: players upgrading from the 0.3.0 wrapper share this
app's profile, and that wrapper registered the live site's service worker
on the same origin. On first bundled launch the app clears the legacy
service worker + cache storage (cookies, localStorage, and IndexedDB are
left untouched) so a stale cache-first worker can't serve the old remote
game over the bundled one.

## Updates — two channels

**1. Native OTA updates (electron-updater, new in v0.4.0).** The
`publish` block in `electron-builder.yml` points at **GitHub Releases**
and is embedded into packaged builds as `app-update.yml`. The app checks
shortly after launch and every 4 hours, downloads updates in the
background, and offers a restart to apply (updates also install on quit).
If an announced update fails to download or apply — the classic case is
an **unsigned macOS build, which cannot silently replace itself** — the
player gets a single notification per version pointing at the itch page
for a manual download; routine feed errors (e.g. no release published
yet) are only logged (`desktop-updates.log` in `userData`), never nagged.

**2. Server-version check (unchanged).** On launch (and hourly), the app
calls the server's `/health` endpoint and reads the current *game*
version. When it differs from the last-seen version (persisted in
`userData`), the app posts a native notification ("Dispatch HQ updated
to v…"), stamps the window title with the new version, and records it.
This tracks the live multiplayer world the player is connected to —
independent of the app's own version above.

### Layout

```
apps/desktop/
  src/
    main.ts       Electron main: window, bundled-content interception,
                  navigation rules, both update channels, smoke-test
                  mode (DHQ_SMOKE=1)
    preload.ts    Minimal contextBridge (safe, no node access in the page)
  assets/
    offline.html                Bundled "server unreachable" page
  build/
    icon.png                    App icon (electron-builder converts per-platform)
    entitlements.mac.plist      Hardened-runtime entitlements (macOS)
  scripts/
    build-release.sh            All-platform release pipeline -> dist/
    stage-web.mjs               Builds apps/web in desktop mode -> web-dist/
  web-dist/                     GENERATED (gitignored): the staged game build
  electron-builder.yml          macOS universal + Windows NSIS + Linux AppImage
                                + GitHub Releases publish feed for OTA
  package.json    electron / electron-builder dev deps, electron-updater dep
  tsconfig.json
```

## Build — single platform (dev)

```bash
pnpm --filter @dispatch-hq/desktop package       # macOS DMG (arm64 host -> arm64)
pnpm --filter @dispatch-hq/desktop package:mac   # macOS universal DMG + zip
pnpm --filter @dispatch-hq/desktop package:win   # Windows NSIS installer (x64)
pnpm --filter @dispatch-hq/desktop package:linux # Linux AppImage (x64)
```

Single-platform output lands in `apps/desktop/release/`.

## Build — full release (all platforms) -> dist/

```bash
bash apps/desktop/scripts/build-release.sh       # all platforms
bash apps/desktop/scripts/build-release.sh mac    # just one platform
SKIP_SMOKE=1 bash apps/desktop/scripts/build-release.sh   # dev loop, no gate
```

This is the release pipeline. It:

1. Compiles the shell (`tsc`) and stages the bundled game
   (`stage-web.mjs` builds `apps/web` in desktop mode into `web-dist/`).
2. Builds the **macOS universal** DMG + zip (one binary for Apple Silicon
   and Intel; verified with `lipo -info` expecting `x86_64 arm64`).
3. Builds the **Windows NSIS** installer (x64) and **Linux AppImage** (x64).
   Building Windows from macOS works (electron-builder bundles its own wine
   for the installer step); a Windows runner is only needed for Windows
   code-signing.
4. **Runs the release gate**: launches the packaged universal app with
   `DHQ_SMOKE=1` — in bundled mode, no `DHQ_APP_URL` — and fails the
   release if the game page doesn't render
   (prints `SMOKE_OK title="Dispatch HQ — Command the Chaos"` on success).
5. Publishes versioned artifacts (plus the `latest*.yml` updater feeds)
   into `dist/mac`, `dist/windows`, `dist/linux` and regenerates
   `dist/SHA256SUMS.txt` + `dist/README.txt`.

For the OTA channel to actually reach players, also create a **GitHub
Release** for the desktop version and attach the same artifacts **and**
the `latest*.yml` / `latest-mac.yml` / `latest-linux.yml` feed files from
`dist/` — electron-updater reads those feeds from the release assets.

## Publishing to itch.io (butler)

The three platform artifacts are small enough to ship to itch as a
**Downloadable** game — the biggest file (the universal DMG) is ~180 MB,
well under itch's 1 GB-per-file limit. `scripts/publish-itch.sh` wraps butler:

```bash
# 1. One-time setup: install butler + authenticate
#    macOS: brew install butler   (or the itch app v26.12+ bundles butler)
butler login                       # opens the browser, one time

# 2. Dry-run — prints the exact butler commands (no butler needed):
scripts/publish-itch.sh <user>/dispatch-hq

# 3. Diff against the live build (authenticates, no upload):
scripts/publish-itch.sh <user>/dispatch-hq --preview

# 4. Push all three platforms (mac/windows/linux channels):
scripts/publish-itch.sh <user>/dispatch-hq --push
```

Details:

- `--userversion` is the **game** version (from `apps/web/src/data/releaseNotes.ts`,
  e.g. `0.29.4`), not the desktop app version — the itch build list reads
  like the game releases.
- Channels: `mac` (universal DMG), `windows` (x64 NSIS installer), `linux`
  (x64 AppImage). Channel names pre-tag the platform on the itch page.
- On the itch page set **Kind of game → Downloadable**. The app bundles
  the full game client, but accounts, saves, and multiplayer run on the
  production server, so players need an internet connection to play —
  say so in the description.
- Subsequent pushes are incremental (butler diffs and uploads only the
  delta), so releasing a new version is near-instant.
- `butler push --dry-run` lists the files that would be sent without
  uploading (`scripts/publish-itch.sh <user>/dispatch-hq --push --dry-run`).

## itch.io page management (API key)

Beyond build pushes, the page itself is scriptable — but it needs a **full** itch
API key, which is **not** the one butler stores. Two keys exist:

| Key | Scope | Used by |
|---|---|---|
| butler key (`~/Library/Application Support/itch/butler_creds`) | `wharf` only — build pushes | `publish-itch.sh` |
| **full API key** (generate at https://itch.io/user/settings/api-keys) | unscoped — `game:edit`, `game:view`, `profile:games`, … | `itch-manage.sh` |

**Never commit the full key.** Pass it per-command (`ITCH_API_KEY=<key> ...`)
or write it to `~/.config/itch/api_key` (the script falls back to butler's
creds, but that only ever gets wharf scope).

```bash
# Page stats (views / downloads / purchases / published state)
ITCH_API_KEY=<key> scripts/itch-manage.sh status

# Edit page fields (short_text, description, tags, …)
ITCH_API_KEY=<key> scripts/itch-manage.sh edit "short_text=Build, recruit, dispatch — now on itch.io" "tags=simulation,strategy"

# Check which scopes a key has (and which commands it can run)
ITCH_API_KEY=<key> scripts/itch-manage.sh verify
```

### Keeping the page description in sync with releases

```bash
# Draft the page description from the LATEST release note + print the apply command
scripts/itch-manage.sh release-checklist

# Draft + auto-apply (needs a full API key; prints the command otherwise)
scripts/update-itch-description.sh
```

`update-itch-description.sh` runs automatically at the end of every successful
deploy (`scripts/deploy.sh` step 9) — it drafts the description from the newest
release note and, when a **full** API key is in the env or
`~/.config/itch/api_key`, applies the edit; a wharf/butler key falls through to
print-only. Skip it for a release with `SKIP_ITCH_UPDATE=1`.

The `edit` command accepts `description=@/path/to/file` for multi-line bodies
(what `release-checklist` and `update-itch-description.sh` use) — the file
content is sent verbatim.

Known limits of the itch API (verified against the reference):
- **Cover images and screenshots have NO upload endpoint** — the API can edit
text fields only. Upload images in the web UI (use the sized JPGs in
`docs/promo/` — all under the 3 MB limit).
- Game ID `4854287` matches the embed widget and is hardcoded in
`itch-manage.sh`.
- The `wharf`/`butler` key answers `api key does not permit ...` for every
page endpoint — that is expected, not a bug.

## Signing — macOS Developer ID + Windows Authenticode

The pipeline is capability-aware — it never hard-fails on a machine without
credentials, and `scripts/signing-check.sh` reports the exact status:

```bash
scripts/signing-check.sh
# ✓ / ✗ lines for macOS Developer ID, macOS notarization, Windows Authenticode
# exit 0 = fully signed, 1 = something missing (with the fix printed)
```

### macOS (Gatekeeper: "cannot be opened because the developer cannot be verified")

- **Signed** when a Developer ID identity exists (`CSC_NAME`, or `CSC_LINK`
  + `CSC_KEY_PASSWORD`, or a cert in the login keychain). The app is built
  with the hardened runtime + entitlements (`build/entitlements.mac.plist`)
  so it is notarization-ready.
- **Notarized + stapled** when `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and
  `APPLE_TEAM_ID` are ALL set AND the app is genuinely signed — this removes
  the Gatekeeper warning entirely.
- **Unsigned (ad-hoc)** otherwise — Gatekeeper warns on first launch
  (right-click → Open) until a real cert is configured.

To get fully signed:

1. **Developer ID Application cert** — https://developer.apple.com/account →
   Certificates → create a *Developer ID Application* cert (needs a paid Apple
   Developer account, $99/yr). Export it as a `.p12`.
2. **Notarization creds** — app-specific password at
   https://appleid.apple.com → Sign-In & Security → App-Specific Passwords;
   Team ID at https://developer.apple.com/account → Membership details.
3. **Build with everything in env** (never commit these):
   ```bash
   CSC_LINK=/path/to/cert.p12 CSC_KEY_PASSWORD=<p12-pass> \
   APPLE_ID=you@apple.com APPLE_APP_SPECIFIC_PASSWORD=<pw> APPLE_TEAM_ID=<team> \
   bash apps/desktop/scripts/build-release.sh all
   ```

### Windows (SmartScreen: "unknown publisher")

Windows signing is env-driven in electron-builder too:

- `CSC_LINK` (+ `CSC_KEY_PASSWORD`) — the code-signing cert, or the
  Windows-specific override `WIN_CSC_LINK` (+ `WIN_CSC_KEY_PASSWORD`).
- A cert comes from a CA (e.g. DigiCert or Sectigo — OV or EV). EV certs
  need a USB token; OV certs can be a `.pfx`/`.p12` file.
- **Easiest path: a Windows CI runner.** electron-builder signs with
  signtool automatically on `windows-latest` when the cert env is set. Building
  the Windows target from macOS with signing additionally needs wine/signtool
  — a Windows runner avoids both.

### Current status

No Developer ID identity, no Apple notarization creds, no Windows cert are
configured on this machine — `scripts/signing-check.sh` confirms all three ✗,
so `dist/` ships unsigned builds (the smoke gate still verifies rendering).
The itch page's Download & install instructions already cover the first-launch
workarounds; signing removes the need for them.

To run from source during development:

```bash
pnpm --filter @dispatch-hq/desktop build:web   # stage the bundled game once
pnpm --filter @dispatch-hq/desktop start       # bundled game in a window
```

Without a staged `web-dist/`, `start` falls back to loading the live site
(with a console warning) so the shell itself can still be hacked on. Set
`DHQ_APP_URL` to point at a local dev server instead — this is the legacy
remote-load mode, with no bundling or interception:

```bash
DHQ_APP_URL=http://localhost:3000 pnpm --filter @dispatch-hq/desktop start
```

## How the update checks work (details)

Server-version check (live game version):

- `main.ts` fetches `${DHQ_APP_URL || production}/health` with a short
  timeout. The health payload includes `version` (bumped on every release
  in `serve-combined.ts` / `index.ts`).
- The last-seen version is stored in `userData` (`lastSeenVersion`).
- If `serverVersion !== lastSeenVersion` and the server version is non-empty:
  a `new Notification` fires, the title bar shows the version, and the stored
  value is updated. Logs are written to the same file (`desktop-updates.log`)
  for debugging.

Native OTA check (app version, electron-updater):

- Active only in packaged builds (and never in `DHQ_SMOKE=1` runs): first
  check ~20s after launch, then every 4 hours.
- Feed = the GitHub Release matching the `publish` provider embedded at
  build time; `latest*.yml` files must be attached to that release.
- Downloads are background + resumable (differential when blockmaps are
  present); a downloaded update prompts **Restart now / Later** and also
  installs on quit (`autoInstallOnAppQuit`).
- Errors before any update is announced (no feed yet, offline) are logged
  only. An error *after* an update was announced (e.g. an unsigned macOS
  build that cannot replace itself) produces one notification per version
  linking to the itch download page.

## Option B — native auto-update → IMPLEMENTED in v0.4.0

The pre-0.4.0 doc sketched this as a future option; v0.4.0 ships it:

1. ✅ `electron-updater` added and `autoUpdater` wired in `main.ts`
   (packaged-only guard, background download, restart prompt, itch
   fallback notification).
2. ✅ `electron-builder.yml` carries a `publish` provider — **GitHub
   Releases** (`Subject-Emu-5259/dispatch-hq`; this repo's VM checkout
   has no git remote configured, so confirm owner/repo before the first
   published release — a wrong value only makes the feed lookup miss,
   which the app logs as "no update").
3. ⚠️ **Signing is still the open item**: unsigned macOS apps cannot
   silently replace themselves — `codesign` is a hard requirement for
   native auto-update *application* on macOS. Until a Developer ID exists
   (see "Signing" above), Mac players get the notify + itch-download
   fallback; signed Windows/Linux builds apply updates in place.
4. Release step: attach the artifacts **and** `latest*.yml` feeds to a
   GitHub Release per desktop version (see the release pipeline section).
