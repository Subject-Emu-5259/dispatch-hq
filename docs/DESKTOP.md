# Dispatch HQ — macOS Desktop App (DMG) & Updates

`apps/desktop` is a thin **Electron** shell around the Dispatch HQ web app. It
gives the game a native macOS presence (dock icon, standalone window, keyboard
shortcuts, notifications) while keeping the game itself entirely server-served.

## Why a shell (and what that means for updates)

Dispatch HQ is a web game — the *entire game* ships from
`https://dispatch-hq.onrender.com` with cache-busted bundles and
a versioned service worker. The desktop app loads that same URL. The big
consequence: **every launch of the DMG is already the latest game**, because
the shell never bundles game code — it renders whatever the server currently
serves.

So "the DMG receives updates" is implemented as **server-driven updates**:

1. On launch (and hourly while running), the app calls the server's `/health`
   endpoint and reads the current game version (e.g. `0.19.5`).
2. It compares that to the version the user last ran (persisted in the app's
   `userData` directory).
3. When the server version differs, the app:
   - posts a native macOS notification ("Dispatch HQ updated to v0.20.0"),
   - updates the window title to the new version, and
   - marks the next launch as a fresh version (no repeat nagging).

No Apple signing, no native updater, no server-side artifact hosting — the
existing deploy pipeline (`scripts/deploy.sh` + `/health` version bump) *is*
the update pipeline. If a player is mid-session, the game's own service worker
picks up the new bundle on their next reload.

### Layout

```
apps/desktop/
  src/
    main.ts       Electron main: window, navigation rules, update checker,
                  smoke-test mode (DHQ_SMOKE=1)
    preload.ts    Minimal contextBridge (safe, no node access in the page)
  build/
    icon.png                    App icon (electron-builder converts per-platform)
    entitlements.mac.plist      Hardened-runtime entitlements (macOS)
  scripts/
    build-release.sh            All-platform release pipeline -> dist/
  electron-builder.yml          macOS universal + Windows NSIS + Linux AppImage
  package.json    electron / electron-builder dev deps, scripts
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

1. Compiles the shell (`tsc`).
2. Builds the **macOS universal** DMG + zip (one binary for Apple Silicon
   and Intel; verified with `lipo -info` expecting `x86_64 arm64`).
3. Builds the **Windows NSIS** installer (x64) and **Linux AppImage** (x64).
   Building Windows from macOS works (electron-builder bundles its own wine
   for the installer step); a Windows runner is only needed for Windows
   code-signing.
4. **Runs the release gate**: launches the packaged universal app with
   `DHQ_SMOKE=1` and fails the release if the game page doesn't render
   (prints `SMOKE_OK title="Dispatch HQ — Command the Chaos"` on success).
5. Publishes versioned artifacts into `dist/mac`, `dist/windows`,
   `dist/linux` and regenerates `dist/SHA256SUMS.txt` + `dist/README.txt`.

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
  e.g. `0.29.4`), not the desktop shell version — the itch build list reads
  like the game releases.
- Channels: `mac` (universal DMG), `windows` (x64 NSIS installer), `linux`
  (x64 AppImage). Channel names pre-tag the platform on the itch page.
- On the itch page set **Kind of game → Downloadable**. Because the shell
  loads the live game, players need an internet connection — say so in the
  description.
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
pnpm --filter @dispatch-hq/desktop start     # loads the live game in a window
```

Set `DHQ_APP_URL` to point at a local dev server instead:

```bash
DHQ_APP_URL=http://localhost:3000 pnpm --filter @dispatch-hq/desktop start
```

## How the update check works (details)

- `main.ts` fetches `${DHQ_APP_URL}/health` (defaults to the production URL)
  with a short timeout. The health payload includes `version` (bumped on every
  release in `serve-combined.ts` / `index.ts`).
- The last-seen version is stored in `userData` (`lastSeenVersion`).
- If `serverVersion !== lastSeenVersion` and the server version is non-empty:
  a `new Notification` fires, the title bar shows the version, and the stored
  value is updated. Logs are written to the same file (`desktop-updates.log`)
  for debugging.

## Option B — native auto-update (only if you want silent binary updates)

The server-driven model covers every game update because the game ships from
the server. A *native* updater is only needed if you later want to push changes
to the **shell itself** (Electron upgrades, window behavior) without a
re-download. If that day comes:

1. Add `electron-updater` and wire `autoUpdater` in `main.ts` (guarded so it's
   inert until configured).
2. Configure `electron-builder.yml` with a `publish` provider pointed at a
   static URL on the Zo server (or GitHub Releases) hosting `latest-mac.yml`
   + the mac zip.
3. **Sign the app** with an Apple Developer ID (unsigned macOS apps cannot
   silently replace themselves — `codesign` is a hard requirement for native
   auto-update).
4. Publish artifacts as part of `scripts/deploy.sh`.

Until then, every DMG install is current-on-launch with zero extra
infrastructure — that's the correct default for a server-served game.
