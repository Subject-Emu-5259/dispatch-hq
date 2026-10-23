# 🚒 Dispatch HQ — Release Notes

---

## 🚀 Zo Deploy & Rollback Runbook

> **The full procedure for shipping a release to the Zo-hosted production instance.** This is the canonical reference — future releases should follow it end-to-end instead of rediscovering the steps. Deploys run as shell commands sent through the Zo API from this machine to the Zo instance.
>
> **⚡ Fast path:** `scripts/deploy.sh <VERSION> <files...>` automates §2–§3 (tarball, upload with byte-exact verify + host fallback, deploy payload) and prints the §4 API command, restart request, and verification commands. Run it from the main checkout; it generates `/tmp/v<VER>-deploy.sh` + `/tmp/v<VER>-payload.json` you can inspect before shipping.

### 0. Production inventory

| Thing | Value |
| --- | --- |
| Public URL | `https://dispatch-hq.onrender.com` |
| Health check | `GET /health` → `{"status":"ok","version":"X.Y.Z"}` |
| Zo project path (on instance) | `/home/workspace/Projects/dispatch-hq` |
| Zo service id | `svc_Y_8aCyzZr5M` |
| Service port | `3001` |
| Service entrypoint | `bun run /home/workspace/Projects/dispatch-hq/servers/game-server/dist/serve-combined.js` |
| Zo API endpoint | `https://api.zo.computer/zo/ask` (POST, Bearer token) |
| API auth | `Authorization: Bearer $ZO_API_KEY` — the `zo_sk_...` key; treat as secret, never commit it |
| `JWT_SECRET` | **Pinned** in the service env (see §0a) — every restart/deploy must use the same value or live sessions 401 |

### 0a. Pinned JWT_SECRET (session stability — mandatory)

The service must run with an explicit `JWT_SECRET` in its env. Since v0.22.18, `config.ts` **refuses to start** when the secret is missing, empty, or still the retired dev fallback — there is no silent fallback anymore (see the boot-guard bullet below). The incident this prevents: a process started outside the service env (e.g. a manual restart mid-deploy) mints tokens the next process rejects — every save/settings/stats call 401s until players re-login (the v0.17.5 incident).

- **Value:** a **crypto-random production secret, rotated 2026-08-13** (pre-launch). The previous pinned value was the dev fallback `dev-secret-change-in-production`; it has been replaced — see §0b. The value is **never committed, printed, or logged**: it lives only in the service env and the founder's password manager.
- **Where:** set on the service env via `update_user_service` (keep every other env var unchanged), then restart with a fresh `ZO_RESTART_TS`.
- **Verify after any restart:** `tr '\0' '\n' < /proc/$(ss -ltnp 2>/dev/null | grep ':3001 ' | grep -oP 'pid=\K[0-9]+' | head -1)/environ | grep '^JWT_SECRET='` — must print the var (presence only; never print the value).
- **Automatic guard:** `scripts/deploy.sh` embeds a session-secret pre-flight in the instance deploy script that aborts the deploy if the running service lacks `JWT_SECRET` **or** its value is empty / still the dev fallback `dev-secret-change-in-production` (the v0.22.17 value gate — presence alone can't stop a regression to a publicly-known secret).
- **Boot guard in code (v0.22.18 — the runbook and the code agree):** `config.ts` calls `assertJwtPinned` at load and **throws** `FATAL: JWT_SECRET is missing, empty, or still the dev fallback — refusing to start` when the secret is unset, empty, or literally `dev-secret-change-in-production`. A misconfigured local run (`bun run dev` with no secret) dies at boot with a message pointing at this section instead of quietly serving rejectable tokens. Two deliberate bypasses, both spelled out in the error: `NODE_ENV=test` (vitest boots config directly and never serves) and `ALLOW_DEV_JWT_SECRET=1` (explicit local-dev escape hatch, mirroring how `PRUNE_GUESTS=0` opts out). There is no other path to run unpinned — so any environment that starts the server without a real secret fails loudly on BOTH sides: locally at boot, and on deploy via the pre-flight above.

### 0a2. Pinned DATABASE_URL & REDIS_URL (data stores — mandatory, v0.22.19)

The JWT boot guard got its siblings: since v0.22.19, `config.ts` gives the two data-store URLs the same treatment, so a misconfigured deploy can't boot against the wrong database.

- **`DATABASE_URL` — HARD STOP at boot.** `config.ts` calls `assertDatabaseUrlPinned` at load and **throws** `FATAL: DATABASE_URL is missing, empty, or still the local-dev fallback — refusing to start` when the URL is unset, empty, or literally `postgresql://dispatch:dispatch_dev_2026@localhost:5432/dispatch_hq`. That fallback's credentials are **committed in the repo** (publicly known) and point at a local dev database — a server booting against it is either a dev box or a misconfigured deploy on the wrong database. **The pre-v0.22.19 reality (production ran with NO `DATABASE_URL` env, silently using the committed fallback — see the §7 hygiene block) is no longer supported**: the deploy pre-flight refuses a deploy whose running env lacks a pinned `DATABASE_URL`, and the boot guard refuses to start without one. If production's DB password is still the dev credential, rotate it first (one `ALTER ROLE` on the instance), then pin the real URL.
- **`REDIS_URL` — LOUD WARNING, not a stop.** Redis pub/sub deliberately degrades to in-memory fanout when absent (single-instance mode is supported), so a missing Redis must not brick a legitimately single-instance deployment — but it is impossible to miss: `assertRedisUrlPinned` logs `[dispatch-hq] WARNING: REDIS_URL is missing, empty, or still the local-dev fallback … Redis pub/sub will run IN-MEMORY`. Cross-instance features (unit positions, alliance chat clustering, viewport relay) will not fan out across instances until a real URL is pinned.
- **Bypasses (both spelled out in the messages):** `NODE_ENV=test` (vitest boots config directly and never serves) and the explicit local escape hatches `ALLOW_DEV_DATABASE_URL=1` / `ALLOW_DEV_REDIS_URL=1` (local dev only — never in production; the deploy pre-flight ignores them and checks the env values themselves).
- **Where:** set both on the service env via `update_user_service` (keep every other env var unchanged — `JWT_SECRET` must stay pinned), then restart with a fresh `ZO_RESTART_TS`.
- **Verify after any restart:** `tr '\0' '\n' < /proc/$(ss -ltnp 2>/dev/null | grep ':3001 ' | grep -oP 'pid=\K[0-9]+' | head -1)/environ | grep -E '^(DATABASE_URL|REDIS_URL)='` — must print both vars (presence only; never print the values).
- **Deploy gate:** `scripts/deploy.sh` embeds a data-store pre-flight in the instance deploy script (after the JWT gate, before the build) that **aborts** the deploy when the running service lacks `DATABASE_URL` or its value is empty / still the dev fallback, and **warns** (does not abort) when `REDIS_URL` is missing or the fallback — so a restart can never boot against the wrong DB, and single-instance Redis-less deployments stay deployable.
- **`pubsub.ts` single source of truth:** the Redis URL is now read from `config.redis.url` (the `redis://127.0.0.1:6379` copy that could diverge from `config`'s `redis://localhost:6379` is gone). `drizzle.config.ts` reads the same `DATABASE_URL` env var, so pinning fixes `drizzle-kit push` on the instance too.

### 0a2a. Operational procedure (copy-paste) — pin the data stores

Run these on the Zo instance in one session, in order. **Never print the values** — presence checks only. Do them back-to-back in a maintenance window: rotating the DB role password invalidates the running process's *new* connections until the env is pinned and the service restarted. The running binary (pre-v0.22.19) already honors `DATABASE_URL` from the env, so pinning works against the old build too — and the guard batch then has nothing to refuse.

**Step 1 — current state (presence only):**
```bash
tr '\0' '\n' < /proc/$(ss -ltnp 2>/dev/null | grep ':3001 ' | grep -oP 'pid=\K[0-9]+' | head -1)/environ \
  | grep -E '^(JWT_SECRET|DATABASE_URL|REDIS_URL)=' | sed 's/=.*/=<set>/'
# expect: JWT_SECRET=<set>, and (before this run) NO DATABASE_URL / REDIS_URL
```

**Step 2 — rotate the DB role password** (only if the DB role still uses the committed dev credential `dispatch_dev_2026`; do this BEFORE pinning). The generator emits URL-safe base64 (no `+` `/` `=`), so the value needs no URL-encoding:
```bash
NEW_DB_PW="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
# superuser via the local socket (peer auth) on the instance:
sudo -u postgres psql -c "ALTER ROLE dispatch PASSWORD '$NEW_DB_PW';"
# alternative if superuser is reachable over TCP:
# psql "postgresql://postgres:<pg-superuser-pw>@localhost:5432/postgres" \
#   -c "ALTER ROLE dispatch PASSWORD '$NEW_DB_PW';"
# prove the NEW credential connects BEFORE pinning it:
PGPASSWORD="$NEW_DB_PW" psql "postgresql://dispatch@localhost:5432/dispatch_hq" \
  -X -A -t -c "SELECT 'db-connect-ok';"
```

**Step 3 — pin the env via `update_user_service`** (keep `JWT_SECRET` and every other env var unchanged; fresh `ZO_RESTART_TS`; restart). Paste the generated `$NEW_DB_PW` into the instruction:
> "On user service svc_Y_8aCyzZr5M (Dispatch HQ, port 3001, entrypoint `bun run /home/workspace/Projects/dispatch-hq/servers/game-server/dist/serve-combined.js`), use `update_user_service` to set `DATABASE_URL=postgresql://dispatch:<NEW_DB_PW>@localhost:5432/dispatch_hq` and `REDIS_URL=redis://<redis-host>:6379`, keeping `JWT_SECRET` and every other existing env var unchanged, with a fresh `ZO_RESTART_TS`, then restart the service. Do not print the values back. Confirm the service is RUNNING on port 3001 and report /health."

**Step 4 — verify after restart:**
```bash
tr '\0' '\n' < /proc/$(ss -ltnp 2>/dev/null | grep ':3001 ' | grep -oP 'pid=\K[0-9]+' | head -1)/environ \
  | grep -E '^(JWT_SECRET|DATABASE_URL|REDIS_URL)=' | sed 's/=.*/=<set>/'   # expect 3 lines
PGPASSWORD="$NEW_DB_PW" psql "postgresql://dispatch@localhost:5432/dispatch_hq" -X -A -t -c "SELECT 'ok';"
curl -s -m 15 https://dispatch-hq.onrender.com/health
```

The service now boots against the pinned URL even though the v0.22.19 boot guard is not in the running binary yet — so when the guard batch deploys, `deploy.sh`'s pre-flight (`check_service_env`) passes and the restart cannot refuse to boot. No `REDIS_URL` on the instance? Omit it — Redis degrades to in-memory fanout (warning-only), and the deploy pre-flight only *warns*.

### 0b. JWT_SECRET rotation (do this before any public launch)

Rotating the secret invalidates **every existing session in one go** (tokens minted under the old secret 401 until players re-login). The client's session-expiry recovery handles the logout gracefully — but only rotate deliberately: pre-launch is the right time, mid-season is not. Rotate at least once before launch, and any time you suspect the secret leaked.

1. **Generate a strong secret locally** (64 hex chars — safe for env values):
   ```bash
   openssl rand -hex 32
   ```
   Record it in your password manager **before** applying it; it will exist nowhere else.
2. **Send one Zo ask** that:
   - reports the current secret *category* without printing it (`CURRENT_SECRET_DEV_FALLBACK` / `CURRENT_SECRET_PINNED_OTHER` / `CURRENT_SECRET_MISSING`) — confirms what you're rotating away from;
   - uses `update_user_service` on `svc_Y_8aCyzZr5M` to set `JWT_SECRET=<new>` **keeping all other env vars intact**, with a fresh `ZO_RESTART_TS`, and restarts the service;
   - verifies after restart: service RUNNING on port 3001, the process env carries `JWT_SECRET` (presence only), and `/health` answers.
3. **Prove tokens mint/verify with the new secret** (auth round-trip against the public URL):
   ```bash
   BASE=https://dispatch-hq.onrender.com
   curl -s -c /tmp/jc -X POST $BASE/api/auth/register -H 'Content-Type: application/json' \
     -d '{"username":"JwtRotateProbe","email":"jwtrotate-<ts>@test.dev","password":"RotateTest2026!"}'
   curl -s -b /tmp/jc $BASE/api/player/me   # 200 JSON ⇒ token verified under the new secret
   ```
   Delete the probe account afterward (`DELETE FROM players WHERE email = '<probe>' AND username = 'JwtRotateProbe'` on the instance) so the leaderboard stays tidy.
4. **Expected fallout:** every live session logs out once (the client shows the auth screen / recovery flow). Announce it if players are online.
5. **Rollback:** to revert, set the previous secret back the same way and restart — old tokens work again, but tokens minted under the intermediate secret stop. There is no secret that satisfies both, so rolling back also costs a re-login.
6. **Never** put the value in this repo, deploy tarballs, or logs. `deploy.sh`'s pre-flight only checks *presence*, so the rotation survives every future deploy as long as the env stays pinned.

### 1. Local prep (before any deploy)

1. **Make changes in the worktree**, then validate locally:
   ```bash
   pnpm --filter @dispatch-hq/web exec tsc --noEmit
   pnpm --filter @dispatch-hq/game-server exec tsc --noEmit
   pnpm build
   pnpm test   # if touching shared/engine logic
   ```
2. **Bump the version in all three places** (the menu footer auto-derives from release notes, and `/health` reads the server strings):
   - `servers/game-server/src/serve-combined.ts` — `version: 'X.Y.Z'`
   - `servers/game-server/src/index.ts` — `version: 'X.Y.Z'`
   - `apps/web/src/data/releaseNotes.ts` — add a new `RELEASE_NOTES` entry at the top of the array
   - **Social card (v0.33.0):** `apps/web/public/og-1200x630.jpg` (the OG/Twitter share card, wired in `index.html`) ships automatically with any web release because Vite copies `public/` into the built client — but only when the tarball includes the built web bundle, so keep `apps/web/index.html` + `public/` on the file list. Refresh the card art whenever the game's look changes.
3. **Sync changed files worktree → main checkout**, byte-identical (`cmp`):
   ```bash
   WT=.freebuff/worktrees/<thread-worktree>
   for f in <changed-files...>; do cp "$WT/$f" "$f"; done
   for f in <changed-files...>; do cmp -s "$WT/$f" "$f" && echo "OK $f" || echo "DIFF $f"; done
   ```
4. **Service-worker cache is bumped AUTOMATICALLY — do not hand-edit it.** If the release ships any web-facing file (`apps/web/*` or `packages/*` — both feed the built client bundle), `scripts/deploy.sh` parses `CACHE_NAME` in `apps/web/public/service-worker.js`, bumps it (`v4`→`v5`…), and **auto-adds the SW to the transfer tarball** so the instance serves the new cache name on that very release (the v0.19.3 stale-bundle incident: the SW sat at `v3` since its initial commit while the fix for the white mission popup shipped later, so returning clients kept the broken bundle). After the run, sync the auto-bumped SW back to the worktree:
   ```bash
   cp apps/web/public/service-worker.js "$WT/apps/web/public/service-worker.js"
   ```

### 2. Package & upload the transfer tarball

1. **Build a tarball of only the changed files** — with **project-relative paths** (so `tar -xzf` inside the project dir on Zo extracts in place). Record the tarball sha256 — it is the transfer checksum:
   ```bash
   cd <main-checkout>
   FILES="<changed-files...>"   # e.g. "apps/web/src/App.tsx servers/game-server/src/index.ts"
   tar -czf /tmp/<VER>.tgz $FILES
   sha256sum /tmp/<VER>.tgz      # → record this checksum
   sha256sum $FILES              # → per-file manifest, embed it into the deploy script (§3 step 4)
   ```
2. **Upload to catbox; if it is down or returns 404, fall back to litterbox** (both verified in production):
   ```bash
   curl -s -m 90 -F "reqtype=fileupload" -F "fileToUpload=@/tmp/<VER>.tgz" https://catbox.moe/user/api.php
   curl -s -m 90 -F "reqtype=fileupload" -F "fileToUpload=@/tmp/<VER>.tgz" https://litter.catbox.moe/resources/internals/api.php
   ```
   The response body is the download URL (e.g. `https://litter.catbox.moe/vsfzz0.tgz`).
3. **Verify the uploaded bytes are byte-exact** (download to a separate path and `cmp`, or re-download and sha256 against the recorded checksum) before deploying.

### 2.5. Version / release-note drift gate (automatic since v0.19.6)

**What it prevents:** the v0.19.6 incident — a tarball built from a Freebuff worktree whose version bump + release note had **not** been synced to the checkout `deploy.sh` runs from, so the bundle shipped the previous release note while the Zo agent patched the instance's version constants to claim the new one. `/health` said `0.19.6` but the main menu footer still rendered **v0.19.5** because the served bundle provably lacked the 0.19.6 note.

`scripts/deploy.sh` runs these checks in section **0.7, before the tarball is even built**, and fails loudly if the version-bearing files cannot prove they carry the version being deployed:

1. **Release note must lead with VERSION** — any web release (`apps/web/*` or `packages/*`) must include `apps/web/src/data/releaseNotes.ts` in the tarball, and its **first** `version:` entry must equal the deployed version. This is exactly the v0.19.6 failure mode (note led with 0.19.5 while deploying 0.19.6).
2. **Server constants must match VERSION — unconditionally (the v0.22.4 fix).** Both `servers/game-server/src/index.ts` and `servers/game-server/src/serve-combined.ts` must report `version: 'X.Y.Z'` equal to VERSION **in the checkout itself, whether or not they are in `<file...>`** — the old gate skipped them when unlisted, so a web-only release whose constants were never bumped sailed through and `/health` went stale after restart. The gate now fails pre-upload, and **auto-adds both files to the tarball** (same pattern as the SW gate) so the running instance always serves the new `/health` version.
3. **Live downgrade guard** — if live `/health` already reports a **newer** version than the one being deployed, deploy refuses (the phantom-`/health` class). Unreachable live → warning, not failure.
4. **Worktree warning** — running from a `.freebuff/worktrees/` path prints a reminder that the tarball is built from *this* checkout, the exact place the v0.19.6 edits were stranded.
5. **Tarball completeness (v0.22.0)** — every `<file...>` argument must exist as a **regular file on disk** (a dropped/typo'd path or an accidentally-listed directory dies in arg validation with a clear message), and after the tarball is built the manifest must contain **exactly** the requested files — count and path match (the v0.21.1 AdminPanel.tsx class: a file the arg list silently omitted made the tarball, and only the post-deploy bundle probe caught it). The regression matrix in `scripts/test-deploy-gate.sh` covers the on-disk failure classes (case T), the server-constant classes (D), the v0.22.4 classes — unlisted-but-stale constants fail pre-upload (S2) and unlisted-but-bumped constants auto-add (S1) — and CI runs it on every `deploy.sh` change.
6. **External-host gate (v0.23.2) — the game is zero-third-party, and a deploy can never silently reintroduce an external host.** Since v0.23.2 the game ships self-hosted fonts, map tiles, routing, and geocoding — the browser makes zero third-party requests. `scripts/check-external-hosts.sh` scans the shipped web sources (`index.html`, `public/`, `src/` minus test files) for any `http(s)://` host NOT in its `ALLOWLIST` and fails the deploy **before upload** when it finds an **unapproved external host(s)**; a clean deploy prints `no unapproved external hosts in the web sources`. The allowlist covers only the deliberate exceptions: the game's own origin (`dispatch-hq-deandrewharris.zocomputer.io`) and the two social `href`s (`www.facebook.com`, `www.reddit.com`). Adding a genuinely required host means adding it to the allowlist **with a reason** — an explicit decision, never an accident. The gate has `--self-test` (proves both directions + test-file exclusion), the runbook↔gate contract in `scripts/check-runbook-sync.sh` (§Side G) fails the build if this item ever drifts from the script's fragments or allowlist, and the gate is exercised in the deploy-gate matrix as cases E1/E2; CI runs all of it on the relevant script changes.

**Implications for a release:**
- The version bump (§1 step 2) must land in the **same checkout `deploy.sh` runs from** — synced worktree → main, `cmp`-verified. The gate is deliberately strict: a web release without a matching release-note entry dies before upload (mirroring the SW cache gate's rule that web releases must ship the SW bump).
- Override the live-check base with `DHQ_LIVE_URL` for non-production targets; `--dry-run` skips the network guard.
- **If the gate fires, it is a signal the bump/note never reached this checkout — sync and re-run.** Do **not** patch the instance to "fix" it; that is precisely the drift the gate exists to catch.

### 3. Deploy to Zo (one shell script, sent via the API)

Send a single bash script as the `input` payload to `POST https://api.zo.computer/zo/ask` with `Authorization: Bearer $ZO_API_KEY`. The canonical steps, in order:

```bash
# 1. BACKUP — source-only snapshot (node_modules/.git/.turbo/dist excluded; dist is rebuilt)
tar -czf /home/workspace/dispatch-hq-backup-pre-<VER>.tgz --exclude='node_modules' --exclude='.git' --exclude='.turbo' --exclude='dist' Projects/dispatch-hq

# 2. DOWNLOAD + TRANSFER CHECKSUM VERIFY (the sha256 of the local tarball, checked ON the instance)
cd /home/workspace/Projects/dispatch-hq
curl -sL -o /tmp/<VER>.tgz <uploaded-url>
echo "<tarball-sha256>  /tmp/<VER>.tgz" | sha256sum -c -

# 3. EXTRACT over the project
tar -xzf /tmp/<VER>.tgz

# 4. PER-FILE VERIFY — every changed file's sha256 must match the local manifest
cat > /tmp/<VER>.hashes <<'HASHES'
<per-file sha256 lines from the local manifest>
HASHES
sha256sum -c /tmp/<VER>.hashes

# 5. BUILD on the instance (produces the new web bundle + server dist)
pnpm build   # or pnpm --filter @dispatch-hq/web build && pnpm --filter @dispatch-hq/game-server build

# 5.5 POST-BUILD SOURCE RE-VERIFY — the build must NOT have been "patched" on the
#     instance to make it pass. Re-check every changed file's sha256 against the
#     manifest right after building. If the Zo agent edited ProfileModal.tsx (or any
#     other changed file) mid-deploy, this fails loudly instead of drifting the
#     instance from main (see Lessons learned — the v0.19.0/0.19.1 GuestUpgradeCard
#     "missing props" incidents).
cd /home/workspace/Projects/dispatch-hq
sha256sum -c /tmp/<VER>.hashes   # must print OK for every line
```

> **If step 5.5 aborts:** the instance is left with drifted source on disk (agent-patched files + a bundle built from them) but the service was **not** restarted, so the old build keeps serving. Do **not** manually restore — simply re-deploy the correct files (a fresh tarball of main's versions overwrites the drift) and let the runbook run end-to-end again. The abort is a signal, not a state: the deploy failed *loudly* by design.

### 4. Schema changes (only when the release touches `servers/game-server/src/db/schema.ts`)

1. **Run `drizzle-kit push` on the Zo instance before restarting** — `cd /home/workspace/Projects/dispatch-hq/servers/game-server && npx drizzle-kit push` (against the production `DATABASE_URL`). The deploy script does **not** run migrations; a schema column added in code but missing in the DB breaks queries at runtime (e.g. the promo redemption log's `level_at_redemption` column).
2. **Re-seed when the seed changed** — `seedDatabase()` only runs via `POST /api/seed` (never on boot). If this release touched `servers/game-server/src/db/seed.ts` (e.g. the `DHQ-LAUNCH` welcome promo code), call it once after the build is live: `curl -s -X POST https://dispatch-hq.onrender.com/api/seed`. Seeding is idempotent by code — it never duplicates codes or resets `usedCount`; on a fresh DB it also creates the Commander player + achievements. **Exception (v0.31.x): the shop catalog self-heals.** `GET /api/shop/catalog` and `POST /api/shop/checkout` call `ensureShopCatalog()` (mirroring `ensureAchievements`), so membership tiers + coin packs populate on first storefront fetch even on a fresh DB that has never seen `/api/seed`.

### 5. Restart & verify

1. **Restart via `update_user_service`** — ask the Zo agent to restart the service with a **fresh `ZO_RESTART_TS`** (a fresh Unix timestamp forces the service to pick up the new build; a cached timestamp is the classic reason a restart "succeeds" but serves old code):
   > "Restart the user service svc_Y_8aCyzZr5M (Dispatch HQ, port 3001, entrypoint bun run /home/workspace/Projects/dispatch-hq/servers/game-server/dist/serve-combined.js) using the update_user_service tool with a fresh ZO_RESTART_TS so it picks up the <VER> build. Confirm the service is RUNNING on port 3001 and report /health."
2. **Verify live:**
   ```bash
   curl -s -m 15 https://dispatch-hq.onrender.com/health   # must show the new version
   curl -s https://dispatch-hq.onrender.com/ | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1  # bundle hash changed
   curl -s <bundle-url> | grep -c '<feature-string>'   # spot-check a new feature string is in the served bundle
   ```
3. **Postgres availability watchdog — never trust `/health` alone (v0.29.4 incident).** `/health` answers `status: ok` **without touching the database** — it is a process liveness probe, not a stack liveness probe. On 2026-08-15 the instance's Postgres was down (`connect ECONNREFUSED 127.0.0.1:5432`, stale socket lock from an unclean shutdown) while `/health` kept reporting `ok`, and every new-player/guest login 500'd until the postgresql watchdog (`svc_mS_FHfGmAYQ`) cleared the lock and recovered. After **every** deploy restart, prove the DB is actually reachable with at least one of:
   ```bash
   # (a) End-to-end write-through check against the public URL — the one that caught the incident.
   #     Guest creation inserts a row, so it 500s with ECONNREFUSED when Postgres is down:
   curl -s -o /dev/null -w 'guest: HTTP %{http_code}\n' -X POST https://dispatch-hq.onrender.com/api/auth/guest   # must be 201
   # (b) On-instance read-only check (run via the Zo agent or SSH):
   pg_isready -h localhost -p 5432                                    # must print 'accepting connections'
   PGPASSWORD="$DB_PW" psql "postgresql://dispatch@localhost:5432/dispatch_hq" -X -A -t -c "SELECT 'ok';"   # must print ok
   ```
   If (a) returns **500** (or (b) fails) while `/health` says `ok`, the DB is down and the restart didn't change that — page the Zo agent to check the postgresql watchdog (`svc_mS_FHfGmAYQ`), clear the stale `postmaster.pid`/socket lock if the watchdog can't, and re-run the checks. Do **not** declare a deploy verified on `/health` alone.

### 6. Rollback (restore from backup)

Every deploy leaves a timestamped backup at `/home/workspace/dispatch-hq-backup-pre-<VER>.tgz`. To roll back:

```bash
# 1. On the instance: move the broken tree aside, restore the backup, rebuild
cd /home/workspace
mv Projects/dispatch-hq Projects/dispatch-hq-broken
mkdir -p Projects/dispatch-hq
# extract only the project subdir from the backup tarball
cd /home/workspace && tar -xzf dispatch-hq-backup-pre-<VER>.tgz Projects/dispatch-hq
cd Projects/dispatch-hq && pnpm install && pnpm build
```

2. **Restart with a fresh `ZO_RESTART_TS`** exactly as in §4 step 1.
3. **Verify** `/health` shows the rolled-back version and the site serves.
4. Older snapshots (e.g. `dispatch-hq-backup-pre-0.12.0.tgz`) provide earlier rollback points; full tree backups from earlier releases exist for worst-case recovery.

### 5.5. Service-worker cache gate (automatic since v0.19.4)

If your release contains any `apps/web/*` or `packages/*` file, the client bundle changes — and the service worker's `CACHE_NAME` must move or returning clients keep serving the stale bundle from before the fix (the v0.19.3 white mission popup: the dark-background fix shipped but clients never fetched it, and resume-on-reload meant tabs rarely refreshed). `scripts/deploy.sh` now does this for you — it prints `SW CACHE GATE: dispatch-hq-v4 → dispatch-hq-v5`, **verifies the new version actually landed in the file** (fails loud if the write didn't take, or if the SW file is missing entirely on a web release), and includes the bumped SW in the tarball. **If you build the tarball by hand (§2), do the bump yourself** or the release will repeat the stale-cache bug class.

### 5.6. itch.io release automation (automatic since v0.34.1)

**Desktop build stamp.** The desktop shells (`apps/desktop`) load the LIVE web app, so the game files never change on a release — but the itch.io build list must still be re-stamped at the current game version, or the page shows a stale version (the 0.33.0 → 0.34.0 lag: content was live, the build list said 0.29.7/0.33.0). `scripts/deploy.sh --run` now does this after every successful deploy: it runs `scripts/publish-itch.sh --push` on all three channels (mac/windows/linux) with `--userversion` from the release notes; butler's diff re-uses 100% of the old data, so it's a tiny metadata patch. Overrides: `ITCH_TARGET` (default `agreatgame/dispatch-hq` — the page slug is **agreatgame**, NOT `deandrewharris`, which butler rejects with `400 invalid target (bad user)`), and `SKIP_ITCH_STAMP=1`. If butler/creds/artifacts are missing the step warns and prints the manual command; if the push itself fails, deploy exits non-zero — the stamp must not silently lag.

**Devlogs have NO API.** The itch server-side API's full surface is `credentials/info`, `profile`, `profile/games`, `games/:id/download_keys`, `games/:id/purchases`, `wharf/latest` — no post endpoint (community threads confirm itch won't add one). Devlogs are a web-dashboard upload only: agreatgame.itch.io → Edit game → Devlogs → New post. Drafts from the release notes live in `plans/itch-devlog-<ver>.md` (dashboard-ready markdown; paste and publish by hand).

**Description edits are full-record replaces.** The `game:edit` API overwrites EVERYTHING the draft doesn't include (Description, Download & install instructions, tags). Never auto-apply `update-itch-description.sh --apply` from a deploy hook; the hand-edited page text is canonical.

### 6. Lessons learned (hard-won, do not re-learn)

- **Copy direction matters.** When syncing version-bump files worktree → main, a wrong-direction `cp` silently reverts the bump. Always `cmp` after every sync and re-check the release-notes hash changed.
- **Catbox dies.** Have the litterbox fallback ready; verify the uploaded bytes byte-exact (download + `cmp`/sha256) — upload "success" ≠ correct bytes.
- **The web rebuild changes the bundle hash.** The first build after deploy produces `index-<A>.js`; a hotfix rebuild produces `index-<B>.js`. The served bundle hash should always match the last build.
- **Admin/auth gap pattern:** mounting `authMiddleware` *after* route registration silently does nothing — mount before. If an endpoint 500s for unauthenticated requests, it likely never ran auth.
- **Fresh `ZO_RESTART_TS` every restart, or nothing changes.** This is the #1 cause of "deployed but still old" reports.
- **Keep the service LABEL/slug as `dispatch-hq` on every restart (v0.24.0 hotfix incident).** A restart via `update_user_service` can quietly rename the service label to a version-suffixed slug (e.g. `dispatch-hq-v0240`), which moves the public URL to `dispatch-hq-v0240-deandrewharris.zocomputer.io` and orphans the canonical `dispatch-hq-deandrewharris.zocomputer.io` — the old host starts returning 404 while the service is perfectly healthy on `localhost:3001`. This is invisible from `/health` on the instance (it always answers locally), so it only shows up as "the site 404s for everyone". After every restart, verify the CANONICAL URL (not a versioned host) serves the new version; if it 404s while a versioned host answers, rename the label back to `dispatch-hq`.
- **Pin `JWT_SECRET` (see §0a).** A restart that runs the server with a different effective secret than the one that minted live tokens 401s every authed call — saves silently "fail", settings reset, stats vanish. The deploy pre-flight + the startup guard in `config.ts` (which since v0.22.18 **refuses to start**, not just warns — run locally with `ALLOW_DEV_JWT_SECRET=1` only when you mean it) exist so this fails loudly, not silently.
- **The data stores get the same boot guard as JWT (v0.22.19).** `config.ts` now **refuses to start** against a missing/empty/fallback `DATABASE_URL` (`FATAL: DATABASE_URL is missing, empty, or still the local-dev fallback — refusing to start`; local escape `ALLOW_DEV_DATABASE_URL=1`) and **warns loudly** on a missing/empty/fallback `REDIS_URL` (Redis degrades to in-memory fanout by design — `ALLOW_DEV_REDIS_URL=1` silences it locally). The deploy pre-flight **aborts** before restart when the running env lacks a pinned `DATABASE_URL` and **warns** when `REDIS_URL` is unpinned — so a restart can never boot against the wrong database. **This changed the production baseline: the previous state (no `DATABASE_URL` env at all, silently booting the committed dev fallback — last documented in the §7 hygiene block) is now a deploy-blocking misconfiguration.** Pin a real `DATABASE_URL` on `svc_Y_8aCyzZr5M` (rotate the DB password first if production's DB still uses the dev credential), and pin `REDIS_URL` to enable cross-instance fanout (or accept the in-memory warning for a single instance). `pubsub.ts` now reads the URL from `config.redis.url` — the divergent `redis://127.0.0.1:6379` copy is gone.
- **`/health` says nothing about Postgres — verify the DB after every restart (v0.29.4 incident).** On 2026-08-15 the instance's Postgres was down (`ECONNREFUSED 127.0.0.1:5432`, stale socket lock from an unclean shutdown) while `/health` happily reported `ok` — the probe answers from memory and never queries the pool. New-player and guest logins 500'd (`api/auth/guest` inserts a row, so it fails when the DB is unreachable) until the postgresql watchdog (`svc_mS_FHfGmAYQ`) cleared the lock and recovered. The deploy pre-flight verifies `DATABASE_URL` is **pinned** in the service env (good — wrong-DB protection) but never checks the DB is **reachable** (availability), so a dead Postgres sails through both the pre-flight and `/health`. Rule: after every restart, run the §5 step-3 watchdog — `POST /api/auth/guest` → `201` (end-to-end, writes a row), or `pg_isready -h localhost -p 5432` → accepting connections on the instance — and treat a 500 as a DB-down incident, not a deploy failure.
- **Never append with a nested heredoc inside a `{ ... } > file` generation group (v0.17.6).** `cat >> "$FILE" <<'EOF'` inside a `{ ... } > "$FILE"` group shares the file but not the offset: the group's fd offset does not advance when the append-fd writes, so the *next* `printf` writes overwrite the start of the appended block. The generated deploy script came out silently corrupted — pre-flight comments truncated (`sions (the v0.17.5`), block moved after the build, `pid=\\K` double-escaped — and `bash -n` caught it only at the point of execution. Rule: **emit through one fd per pass.** `scripts/deploy.sh` now writes the pre-flight heredoc to a temp file first, then `cat "$PREFLIGHT_TMP"` inside the group.
- **`bash -n` the generated deploy script before sending it to Zo (v0.17.6).** The corrupted script survived every byte-exact check (sha256 verifies *the bytes you sent*, not their correctness) and the deploy ask ran with it; the syntax error aborted mid-script after the build, so the instance was left with new code but no restart. Gate before any API call: `bash -n /tmp/v<VER>-deploy.sh` must pass (a `<UPLOAD_URL_PLACEHOLDER>` is expected in `--dry-run` only) and the pre-flight block must sit between the per-file verify and the build.
- **macOS tar embeds AppleDouble `._*` junk; the Linux instance keeps it (v0.22.4 cleanup).** 37 `._*` resource-fork entries (`. _service-worker.js`, `._App.tsx`, `._package.json`, …) were found scattered across the instance tree — artifacts of extracting tarballs made on macOS. Harmless to the build (nothing imports them) but they make the instance tree drift from main byte-exact and bloat the source tree. `scripts/deploy.sh` now sets `COPYFILE_DISABLE=1` + `COPY_EXTENDED_ATTRIBUTES_DISABLE=1` before its `tar -czf`, so new tarballs carry no `._*` entries (verified: 0 in a fresh tarball). Dead feature files removed from main but never cleaned off the instance (`cityServices.ts`/`cpuUnits.ts` + tests, imported nowhere) were also deleted in the same sweep — clean them the same way any time the drift diff reports ONLY-instance files that main no longer has.
- **Service-worker cache versions are a release gate, not a nicety (v0.19.3).** `CACHE_NAME` sat at `dispatch-hq-v3` from the SW's initial commit; the fix for the white, non-functional mission popup shipped inside a newer bundle, but returning clients kept serving the stale one — the white popup "came back" for them even though the deployed bundle was provably dark (its `bg-gray-950/95` + inline `rgba(3,7,18,0.95)` were in the live JS/CSS). Bump the SW cache on **every** release that changes any web-facing file, and remember the `activate()` handler only purges old caches after the new SW takes control — an already-open tab needs one hard reload. Now automated in `scripts/deploy.sh` (§5.5).
- **Post-build source re-verify (v0.19.0/0.19.1 — the phantom "missing required props" claims).** The Zo agent twice reported that `ProfileModal.tsx` failed to build because `<GuestUpgradeCard />` "requires" `onDismiss`/`onUpgraded`, and patched the instance source to make the build pass. The diagnosis was wrong on both counts: those props are **optional** in main, the identical source builds clean locally, and the served bundle was verifiably our code. Root cause: `GuestUpgradeCard.tsx` itself had **never been in any deploy tarball**, so the instance still ran an older required-props version of it while main had evolved to optional props — the pristine `ProfileModal.tsx` genuinely could not compile *against the stale sibling*, not because it was broken. Fix: deploy the component **and** its dependency together, then re-verify **after** the build. The deploy script now runs `sha256sum -c /tmp/<VER>.hashes` a second time post-build (step 5.5) so any mid-deploy agent edit to a changed file (including `ProfileModal.tsx`) aborts the deploy instead of silently diverging the instance from main. Byte-exact verification must cover *the final on-disk state after the agent works*, not just the bytes you uploaded.
- **The Zo API can swallow deploy requests — never treat a 303/empty body as submitted (v0.20.5).** The `POST /zo/ask` endpoint intermittently answers `303` (or an empty `200`) with 0 bytes while still queueing the request — and a queued request can execute *later*, so firing blind retries produced a double deploy and a brief window where `/health` served a stale version mid-cycle. Following the redirect with `curl -L` is worse: the 303 converts POST→GET and the API rejects it with `400 modal-http: bad redirect method`. Rule: **loop the API call until a real JSON response (containing `"output"`) arrives, report every swallowed attempt, hard-cap at 8, and fail loudly if none arrives** — never assume a swallowed request succeeded, and verify `/health` before sending the restart request. `scripts/deploy.sh --run` now does exactly this (§8, `DEPLOY_RETRIES` overrides the cap).
- **The intermittent `401 "Not enough segments"` is a second swallow class — retry it, never treat it as a hard stop (v0.22.7).** A fresh `POST /zo/ask` occasionally 401s with `Not enough segments` (a Zo routing quirk) while the *identical* payload succeeds on the next attempt. It is not an auth failure (the same `ZO_API_KEY` works moments later) — firing once and stopping, or burning the whole budget on it, loses real deploys. `scripts/deploy.sh --run` classifies every response with `classify_zo_response` (§8): only a non-empty JSON body carrying `"output"` counts as submitted; `401` + `Not enough segments` is logged as the known swallow class and retried like the 303 class; anything else non-real is reported with its class and retried too. Cap and fail-loudly behavior are unchanged — and the classifier is covered by the deploy-gate matrix (`test-deploy-gate.sh` case Z, run by CI on every `scripts/deploy.sh` change).
- **The tarball must prove its version before upload (v0.19.6 — the phantom `/health` vs. stale menu footer).** The first v0.19.6 deploy built its tarball from a Freebuff worktree whose version bump + release note edits had landed **only there**, not in the main checkout `deploy.sh` reads from — so the bundle shipped the old `releaseNotes.ts` (0.19.5 first) while the Zo agent patched the instance's version constants to claim 0.19.6. Result: `/health` said `0.19.6` but the main menu footer still rendered v0.19.5, and a grep of the served bundle showed no 0.19.6 note at all. Fixes: (1) `scripts/deploy.sh` section **0.7** now runs a **pre-upload drift gate** (§2.5) — the release note must lead with VERSION, the server constants must match, live must not already be newer, and a worktree run prints a warning — so this failure class dies before upload instead of after; (2) the deeper habit: **verify which checkout an edit landed in** before deploying — relative-path edits made during a worktree session can silently write to the worktree while the deploy reads main. Check with `git -C <checkout> diff --stat <file>` on both checkouts, or run the deploy from the same checkout the edits are in.
- **The deploy list is not the drift list — hash the whole source tree, not just the tarball (v0.22.3).** The v0.22.3 tarball shipped 16 files that all verified byte-exact, and the build passed — but the served bundle still differed from a local build, and the first on-instance web build had actually failed. Root cause: several **unlisted** files had changed in main since the last full deploy and were never shipped — the whole CPU-mutual-aid feature (`App.tsx`, `MissionCard.tsx`, `SettingsModal.tsx`, `UnifiedDispatchCenter.tsx`, `cpuMutualAid.ts`, `mission.ts`), the v0.22.0 share card (`shareCard.ts`, `ShiftReportModal.tsx`), `vite.config.ts`, `routes/settings.ts`, plus `package.json`/`pnpm-lock.yaml`/`turbo.json`/`servers/game-server/package.json`. The import-coverage pre-flight (§0.5) **did** warn about shared files — and the warning was dismissed as "already shipped," which was wrong for `stations.ts`/`perks.ts` (the first build failure) and for the rest of the set. Rules: (1) **treat the §0.5 import-coverage warning as blocking** unless every flagged file is proven byte-identical on the instance; (2) before uploading, run a **full source-tree hash diff** between the instance and the release checkout (every `.ts`/`.tsx` under `apps/web/src`, `packages/shared/src`, `servers/game-server/src`, plus `package.json`/`pnpm-lock.yaml`/`turbo.json`/`vite.config.ts`/`vitest.config.ts` and the `public/` tree) and ship **every** differing file, not just the ones you remember editing; (3) after the restart, grep the **served bundle** for a string unique to each intended feature (e.g. `cpuHandled`, `sharedAsImage`) — absence means the feature isn't live no matter what `/health` says. Note: `vite.config.ts` inlines `__BUILD_TIME__`, so bundle filenames can never match local-vs-instance; judge bundle parity by features and source hashes, not the `index-*.js` name.
- **The server version bump used to slip past every gate (v0.22.4) — now the drift gate enforces it.** The full-tree hash diff shipped every changed file, the build passed, and the restart succeeded — yet `/health` still reported `0.22.3`. The server-side version string is **hardcoded** in `servers/game-server/src/serve-combined.ts` AND `src/index.ts` (`version: '0.22.x'` in the `/health` handler); main and the instance both carried the old `0.22.3`, so the hash diff saw no drift — and the 0.7 gate only checked the constants when they happened to be in `<file...>`, which they weren't. Rules now: (1) the **bump itself is still a manual edit** — bump **both** server constants + the release note + the package.json trio on every release — but the drift gate (§2.5) now fails **before upload** if the checkout's constants don't carry VERSION, and **auto-adds both files to the tarball** so `/health` ships the new version; (2) if `/health` still reports an old version after a restart, the constants were never bumped in the deployed checkout (the gate should have fired) — check `git diff` on the two constant files rather than deploying a second tarball; (3) the release note's `currentVersion()` and the server's `version` field must agree before the drift gate runs.

### 7. Scheduled maintenance probes (nightly DB hygiene)

Stray verification/QA accounts get noticed **automatically** instead of only during manual sweeps. Two cron probes run on the instance; both are **read-only** (they never write, delete, or update a row — cleanup stays a manual, founder-reviewed step).

**`scripts/db-hygiene.sh`** — flags disposable-pattern accounts: throwaway email domains (`@test.dev`, `@test.com`, `@test.local`, `@example.com`, `@mail.com`), verification username prefixes (`savetest`, `toktest`, `authtest_`, `deploytest`, `testsave`, `smokeuser`, `pincheck`, `qauser`), and timestamped numeric usernames like `1786057959user3`. Exit codes: `0` clean / `1` found / `2` error; optional `DHQ_HYGIENE_ALERT_URL` webhook for push alerts. **`DATABASE_URL` is REQUIRED — there is no dev fallback in the script (exit `2` when unset): the pinned service env is the only source of truth, and ops tooling must never query the committed dev credentials.** The persistent smoke account (`smoketest@dispatchhq.game` / `dhq_smoke_bot`) and the founder (`deandrewh26@gmail.com`) match **no** pattern, so they are never flagged. **Caveat:** `@mail.com` is a real free-email provider — a hit there deserves a founder eyeball before any cleanup; the check only flags, so a false positive costs review time, nothing else.

The exact psql invocation (the same query the script runs — read-only, against the production DB **on the instance**):

```bash
# Since v0.22.19 production MUST pin DATABASE_URL in the service env — the
# config boot guard refuses to start against the committed dev fallback, and
# the deploy pre-flight refuses a deploy whose running env lacks it. Discover
# the pinned URL from the service env (presence only, mask the password):
#   tr '\0' '\n' < /proc/$(pgrep -f serve-combined | head -1)/environ | grep '^DATABASE_URL='

DATABASE_URL="postgresql://dispatch:<real-prod-password>@localhost:5432/dispatch_hq"
psql "$DATABASE_URL" -c "
SELECT id, username, email, level, credits, created_at, last_active
FROM players
WHERE email ILIKE '%@test.dev' OR email ILIKE '%@test.com' OR email ILIKE '%@test.local'
   OR email ILIKE '%@example.com' OR email ILIKE '%@mail.com'
   OR username ILIKE 'savetest%' OR username ILIKE 'toktest%' OR username ILIKE 'authtest_%'
   OR username ILIKE 'deploytest%' OR username ILIKE 'testsave%' OR username ILIKE 'smokeuser%'
   OR username ILIKE 'pincheck%' OR username ILIKE 'qauser%'
   OR username ~ '^[0-9]{6,}(user|test|qa|smoke)[0-9]*$'
ORDER BY created_at;"
```

Nightly cron on the instance (install once; the smoke test below is already scheduled):

```bash
0 3 * * * bash /home/workspace/Projects/dispatch-hq/scripts/db-hygiene.sh >> /tmp/dhq-hygiene.log 2>&1
# with push alerts (recommended):
0 3 * * * DHQ_HYGIENE_ALERT_URL=<webhook> bash /home/workspace/Projects/dispatch-hq/scripts/db-hygiene.sh >> /tmp/dhq-hygiene.log 2>&1
```

If a run reports accounts, cleanup is a manual transaction (delete child rows in FK-safe order first — `player_saves`, `stations`, `units`, `player_settings`, `player_stats`, `player_achievements`, `promo_redemptions`, `alliance_members`, `bug_reports` — then `players`), scoped strictly to the flagged ids, and **never** touching `smoketest@dispatchhq.game` or `deandrewh26@gmail.com`. Verified clean on 2026-08-06 (count = 0, no false positives). The save-health probe (`scripts/smoke-test.sh --no-litter`, every 2 hours, cron on the instance) is the other scheduled maintenance check.

---

## v0.9.0 — "Training, Reports & Priority" (Beta)

**Release Date:** August 4, 2026
**Status:** Beta / Public Test Build
**Codename:** Training, Reports & Priority
**URL:** https://dispatch-hq.onrender.com

### Overview

v0.9.0 deepens the career loop with unit training, adds an end-of-shift debrief, and makes the Dispatch Center rank calls the way a real dispatcher would.

### What's New

#### Unit Training

- Crews can be sent to the academy from the unit panel — up to level 3.
- Training costs credits and takes real minutes; the unit is unavailable until it finishes (live countdown shown).
- Trained units clear scenes faster via the training tech multipliers (`Basic Training`, `Specialization`, `Elite Squad`).
- Mission requirements with `minTrainingLevel` now gate dispatch — untrained crews can't be sent to jobs they aren't certified for.

#### Dispatch Priority

- Every call gets a severity-derived priority: `low` → `medium` → `high` → `critical` (difficulty 8+, hazmat, and rescue are always critical; calls with a ≤60s window bump a tier).
- Dispatch Center sorts the board by priority and paints a color-coded badge on each call.
- Escalating incidents and Aftermath follow-ups recompute priority as they worsen.

#### Shift Reports

- New Shift Report modal in the pause menu: shift duration, missions completed/failed, traffic duties, credits/XP earned, level-ups, and a clearance-rate bar.

#### Fixes & Polish

- Traffic duties fixed: EMS patrols now generate real road-accident duties (never arbitrary calls), and duty difficulty/rewards now match the incident instead of the wrong template.
- Fog-of-war Map Scanner tech applies instantly on purchase.
- Server `/health` version bumped to `0.9.0`.

### Known Issues

- True multiplayer, server-side leaderboards, and alliance play remain future features.

---

## v0.1.0 — "First Alarm" (Alpha)

**Release Date:** July 26, 2026
**Status:** Alpha / Development Build
**Codename:** First Alarm

---

### 📖 Overview

**Dispatch HQ** is a real-time emergency dispatch simulation game where you command fire stations, dispatch units, and respond to emergencies across a live city map. Built as a modern, multiplayer-first alternative to MissionChief.

> *"Command the chaos."*

This is the **initial alpha release** — a fully functional client-side prototype demonstrating the core UI, map interaction, mission spawning, and game state management.

---

### 🏗️ Architecture

| Layer | Technology | Details |
| --- | --- | --- |
| **Monorepo** | pnpm 9.15 + Turborepo 2.10 | Workspace-based, 4 packages |
| **Frontend** | React 19 + TypeScript + Vite 6.4 | SPA with HMR |
| **Map** | MapLibre GL JS 4.7 | OpenStreetMap raster tiles |
| **State** | Zustand 5 | Global reactive store |
| **Animations** | Framer Motion 12 | Smooth UI transitions |
| **Icons** | Lucide React | Fire station & mission icons |
| **Backend** | Hono 4 + Node.js | Placeholder API server |
| **Database** | PostgreSQL 16 + PostGIS | Docker Compose configured |
| **ORM** | Drizzle ORM | Type-safe DB queries |

---

### ✨ Features Implemented

#### 🗺️ Interactive Map

- Full MapLibre GL JS integration centered on **New York City** (40.7128°N, 74.006°W)
- **Dark mode** map theme with dimmed + desaturated OSM raster tiles
- **Light mode** map theme with standard OSM tiles
- **Satellite** style option (placeholder)
- Map style switching from sidebar (instant toggle)
- Zoom controls, scale bar, compass bearing
- Click-to-place interaction (ready for station building)

#### 🏢 Station System

- **Build Fire Station** button with 3-step modal workflow:
  1. Select station type (Engine House, Ladder Company, Rescue Squad, Battalion HQ)
  2. Click map to place
  3. Confirm build
- Station types with different costs, unit capacity, and unlock levels
- Station markers on map with colored circles + 🔥 emoji
- Sidebar station list with details

#### 🚨 Mission System

- **Auto-spawning demo missions** every 8 seconds near NYC
- 12 mission types defined across 4 categories:
  - 🔥 **Fire**: House Fire, Building Fire, Vehicle Fire, Kitchen Fire, Garage Fire, Warehouse Fire, Wildfire, Dumpster Fire, Electrical Fire, Chimney Fire, Brush Fire, Factory Fire
  - 🚗 **Traffic** (planned)
  - 🆘 **Rescue** (planned)
  - ☣️ **Hazmat** (planned)
- Mission cards with:
  - Difficulty stars (★☆☆ to ★★★)
  - Credit rewards
  - XP rewards
  - Live countdown timer (10-minute expiry)
  - Required units display
- Missions on map as colored markers:
  - 🟡 Amber = active (7+ minutes)
  - 🟠 Orange = urgent (3-7 minutes)
  - 🔴 Red + pulse = critical (&lt;3 minutes)
- Framer Motion animations for mission appearance/disappearance

#### 💰 Economy System

- Starting credits: **10,000**
- Credit rewards per mission completion
- XP system with leveling
- Station costs varying by type
- Unit purchase costs

#### 🎨 UI / UX

- **Sidebar** with Dispatch HQ branding and fire icon logo
- Player info panel (credits, level, XP)
- Dark/light mode toggle
- Map style selector (dark/light/satellite)
- Active missions panel with real-time updates
- Stations panel with build prompts
- Responsive layout
- "Command the chaos" tagline

#### 🎭 Game Engine

- Mission spawn system (random locations within radius of NYC center)
- Mission expiry timer (10-minute countdown)
- Demo player with 10,000 credits, Level 1
- Zustand state management with full game state

---

### 📁 Project Structure

```markdown
dispatch-hq/
├── apps/
│   └── web/                    # React frontend
│       └── src/
│           ├── components/
│           │   ├── map/
│           │   │   └── MapView.tsx        # MapLibre GL map + markers
│           │   ├── BuildStationModal.tsx   # 3-step station builder
│           │   ├── MissionCard.tsx         # Mission display cards
│           │   └── Sidebar.tsx            # Main sidebar panel
│           ├── hooks/
│           ├── stores/
│           │   └── gameStore.ts            # Zustand global state
│           ├── App.tsx                     # Root component
│           ├── main.tsx                    # Entry point
│           └── index.css                   # Global styles
├── packages/
│   ├── shared/                  # Shared types & constants
│   │   └── src/
│   │       ├── types/           # TypeScript interfaces
│   │       │   ├── station.ts   # Station, GeoPoint
│   │       │   ├── unit.ts      # Unit, UnitType, UnitStatus
│   │       │   ├── mission.ts   # Mission, MissionTemplate
│   │       │   ├── player.ts    # Player profile
│   │       │   └── events.ts    # WebSocket events
│   │       └── constants/       # Game balance data
│   │           ├── stations.ts  # Station configs (4 types)
│   │           ├── units.ts     # Unit configs (4 types)
│   │           └── missions.ts  # Mission templates (12 types)
│   └── game-engine/             # Server-side game logic
│       └── src/systems/
│           ├── MissionSystem.ts  # Mission lifecycle
│           └── SpawnSystem.ts    # Mission spawning
├── servers/
│   └── game-server/             # Hono API server
│       └── src/
│           ├── index.ts          # Server entry
│           ├── config.ts         # Server config
│           └── db/               # Database layer
├── infra/
│   └── docker/
│       └── docker-compose.yml   # PostgreSQL + Redis
└── turbo.json                   # Turborepo config
```

---

### 🛠️ Development Setup

```bash
# Install dependencies
pnpm install

# Start all services (Vite + Hono + tsc watch)
pnpm dev

# Access the game
open http://localhost:3000
```

**Running Services:**

| Service | URL | Description |
| --- | --- | --- |
| Vite Dev Server | http://localhost:3000 | Frontend with HMR |
| Game Server | http://localhost:3001 | Hono API (placeholder) |
| PostgreSQL | localhost:5432 | Database (Docker, not started) |
| Redis | localhost:6379 | Cache/pub-sub (Docker, not started) |

---

### 🔧 Bug Fixes (v0.1.0)

During the initial build, the following issues were discovered and resolved:

| \# | Issue | Resolution |
| --- | --- | --- |
| 1 | `setElement is not a function` (MapLibre GL v4 API) | Refactored marker updates to clear + recreate instead of mutating |
| 2 | TypeScript `baseUrl` deprecation warning | Removed deprecated `"baseUrl": "."` from tsconfig |
| 3 | `ReferenceError: Cannot access 'mapStyle' before initialization` | Moved `useRef(mapStyle)` after `useGameStore()` hook call |
| 4 | `tsc --watch` crashing Turborepo pipeline | Created missing `file tsconfig.json` for game-engine package |
| 5 | Turborepo parse error (trailing comma) | Fixed `file package.json` in game-engine |
| 6 | `ERR_ABORTED` from CartoDB CDN | Switched to inline OSM raster tile styles |
| 7 | Duplicate `GeoPoint` exports (TS2308) | Consolidated to single definition in `file station.ts` |
| 8 | Missing `rootDir` in shared tsconfig | Added `"rootDir": "./src"` |

---

### 📋 Known Limitations (Alpha)

| Area | Limitation | Planned Fix |
| --- | --- | --- |
| Map Tiles | OSM raster only (basic dark filter) | Upgrade to MapTiler / MapLibre vector tiles |
| Map Tiles | OSM rate limits for heavy use | Add tile caching / fallback CDN |
| Backend | Hono server is placeholder only | Full WebSocket server in Phase 2 |
| Database | Not connected (Docker not started) | PostgreSQL + PostGIS in Phase 2 |
| Multiplayer | Single-player demo only | WebSocket real-time sync in Phase 2 |
| Units | No unit purchasing or dispatching | Unit system in Phase 2 |
| Missions | Auto-spawn demo only, no station response | Station-to-mission logic in Phase 2 |
| Auth | No user authentication | JWT auth in Phase 2 |
| Mobile | Not optimized for mobile | Responsive pass in Phase 3 |

---

### 🗺️ Roadmap

#### Phase 1 — ✅ Foundation (Complete)

- [x]   Project scaffolding (monorepo, packages, configs)

- [x]   Interactive map with style switching

- [x]   Station building modal (3-step flow)

- [x]   Mission spawning system (12 types)

- [x]   Mission cards with live timers

- [x]   Zustand state management

- [x]   Player stats (credits, level, XP)

- [x]   Map markers (stations + missions)

- [x]   Demo game loop (auto-spawning missions)

#### Phase 2 — 🔧 Backend & Real Gameplay (Complete)

- [x]   PostgreSQL + PostGIS database

- [x]   Station CRUD with database persistence

- [x]   Unit purchasing and management

- [x]   Unit dispatching to missions

- [x]   Real-time WebSocket server (Hono)

- [x]   Mission response and completion flow

- [x]   Credit/XP rewards on completion

- [x]   Level-up system

- [x]   User authentication (JWT)

- [x]   REST API for all game actions

#### Phase 3 — 🌐 Multiplayer & Polish

- [ ]   Multiplayer: see other players' stations & units

- [ ]   Real-time unit movement on map

- [ ]   Chat system

- [ ]   Leaderboard

- [ ]   Achievements & progression

- [ ]   Mobile-responsive UI

- [ ]   Sound effects & notifications

- [ ]   PWA support (installable)

- [ ]   Admin dashboard

---

---

## v0.5.0 — "Public Ready" (Phase 1)

**Release Date:** August 1, 2026
**Status:** Beta / Public Test Build
**Codename:** Public Ready
**URL:** https://dispatch-hq.onrender.com

### Overview

Phase 1 hardens Dispatch HQ for public testing: real branding, public metadata, a synthesized audio layer, settings persistence, and the most critical gameplay fixes from the full audit.

### What's New

#### Branding & Public Presence

- Public favicon package (`file favicon.ico`, `file favicon-32x32.png`, `file apple-touch-icon.png`, `file logo-512.png`)
- Complete Open Graph / Twitter Card metadata for social sharing
- `file manifest.json` for PWA installability
- `file robots.txt` and `file sitemap.xml` for search indexing
- `file AGENTS.md` root index for future development sessions

#### Audio & Settings

- New synthesized sound layer using the Web Audio API — no external assets required
- Tone types: dispatch tone, mission alert, success chime, radio beep, UI click
- In-game **Settings** modal accessible from Pause menu, with:
  - Sound effects on/off toggle
  - Volume slider (0–100%)
  - Simulation speed slider (0.5×–2×)
  - Music toggle placeholder
- Settings persist with localStorage

#### Gameplay Fixes

- Fixed unit return/patrol speed math so `m/s` values are interpreted correctly (units no longer crawl at \~3× slower speed)
- Fixed game loop `setInterval` missing delay that caused unnecessary CPU load
- Added dispatch tone when a unit is sent to a mission
- Added success sound on mission completion
- Added alert sound on mission expiration
- Mute toggle in TopBar now persists with settings

#### Code Quality

- TypeScript build clean (`pnpm typecheck`)
- Web and server packages build clean
- Missing `getDistance` import in MissionCard replaced with `haversineKm`

### Known Issues (Phase 2)

- Settings / pause menu Settings button on Main Menu not yet wired
- Game speed slider requires pause/resume to take effect
- Backend uses offline/guest auth by default; leaderboard/chat are simulated
- AI dispatch assistant panel is a UI placeholder
- Station build map placement and unit dispatch need further UX refinement

### 👥 Credits

Built with ❤️ by the Dispatch HQ team.

**Powered by:**

- React 19 · MapLibre GL JS 4 · Zustand 5 · Framer Motion 12
- Vite 6 · TypeScript 5.9 · Tailwind CSS 3.4
- Hono 4 · PostgreSQL 16 · PostGIS · Drizzle ORM
- pnpm · Turborepo

---

## v0.6.2 — "Speed & Pause Fixes" (Beta Hotfix)

**Release Date:** August 2, 2026
**Status:** Beta / Public Test Build
**Codename:** Speed & Pause
**URL:** https://dispatch-hq.onrender.com

### Overview

v0.6.2 addresses the remaining gameplay friction flagged in the v0.6.x public beta: simulation-speed changes now take effect instantly, and the pause overlay actually freezes mission/unit timers while open.

### What's New

#### Gameplay

- **Live simulation-speed changes:** changing the Simulation Speed slider in Settings now recreates the game-loop interval immediately, so 0.5×–2× speed no longer requires a pause/resume cycle.
- **Real pause:** opening the pause overlay now halts the 1-second mission/unit tick effect. Mission countdowns, en-route ETA ticks, and return-to-station movement resume when you unpause.

#### Engine & Stability

- TypeScript build clean across `apps/web`, `servers/game-server`, `packages/shared`, and `packages/game-engine`.
- Server `/health` version bumped to `0.6.2`.
- Live service redeployed after the changes.

### Known Issues

- AI dispatch assistant remains a fully-offline, rule-based panel.
- True multiplayer, server-side leaderboards, and cross-player chat remain future work.

---

---

## v0.6.1 — "Route Dot & CAD Multi-Dispatch" (Beta Hotfix)

**Release Date:** August 2, 2026
**Status:** Beta / Public Test Build
**Codename:** Route Dot & CAD Multi-Dispatch
**URL:** https://dispatch-hq.onrender.com

### Overview

v0.6.1 finishes the follow-up items from the v0.6.0 visual and CAD revamp: a pulsing leading dot on GPS routes, multi-unit dispatch from the CAD console, and unit names directly on map markers.

### What's New

#### Map Visuals

- **Leading route dot:** en_route units now show a small pulsing cyan/white dot at the head of the remaining route polyline, making the next turn and destination easier to read at a glance.
- **Unit name callout:** each unit marker now displays the unit's name in a compact dark badge above the colored puck, so you can scan the fleet without opening the sidebar.

#### CAD / Dispatch Console

- **Multi-dispatch in the Unified Dispatch Center:** the Dispatch Board shows a row of available matching-unit chips for every unassigned mission. Click to toggle units, then press **DISPATCH SELECTED** to send them all to the call.
- Selected units are cleared after dispatch; dispatching follows the same real-road routing as single-unit dispatches.

#### Engine & Stability

- Clean TypeScript builds for `apps/web` and `servers/game-server`.
- Live service redeployed and verified after the changes.

### Known Issues

- AI dispatch assistant and true multiplayer remain placeholders.
- Settings speed slider still requires pause/resume to take effect.

---

## v0.6.0 — "Unit Visuals & CAD Revamp" (Beta)

**Release Date:** August 2, 2026
**Status:** Beta / Public Test Build
**Codename:** Unit Visuals & CAD Revamp
**URL:** https://dispatch-hq.onrender.com

### Overview

v0.6.0 polishes the in-field visual layer and tightens the CAD-to-mission flow so players can clearly see where every unit is, what it is doing, and how long until it arrives. This release completes the first major UX pass for public beta feedback.

### What's New

#### Map Visuals

- Reworked unit markers: 34 px colored puck with bold status ring, white inner disc, vehicle emoji, and a pulsing glow for en_route and on_scene units.
- Live ETA callout on en_route markers and an "ON SCENE" badge for arrived units.
- Flowing GPS route line: two-tone casing, bright cyan core, soft glow, and an animated white dash overlay that travels toward the target destination.
- Selected-unit follow: clicking a unit card or marker flies the map camera to that unit and keeps it centered while selected.

#### Units Panel (Sidebar)

- New real-time Units section in the sidebar.
- Fleet summary tiles: total, ready, en route, and on scene.
- Cards grouped by status with live ETA countdown, route progress bar, assigned mission, current speed, and a recall-to-station button while en route.
- Updates from the store 1 Hz ETA tick + 10 Hz position tick.

#### CAD / Mission Integration

- CAD dispatches now use the same real-road route engine as the sidebar MissionCard.
- Dispatch button shows a "Routing…" state while the route is fetched.
- Incident board reads the same mission store as the sidebar, so calls from either surface appear instantly everywhere.
- Sidebar multi-dispatch: checkbox unit picker lets you satisfy squad requirements like "2× engine" before assigning.

#### Immersion

- Unit arrival toast fires when a unit flips to on_scene.
- Mission failure toast + SFX cue when an undispatched mission expires.
- Radio auto-chatter for dispatched, en_route, on_scene, returning, available, and patrolling units, with unit reply callbacks.
- Post-mission standby: units hold at the scene for 30 seconds before automatically returning to station.

#### Engine & Stability

- Unit return/patrol speed math fixed (m/s interpreted correctly).
- Game loop interval delay restored to prevent runaway CPU.
- Map marker zoom scaling tuned to stay readable and avoid covering roads.
- OSRM routing timeout raised to 10 s with one 12 s retry and a 5-minute route cache.
- Black-screen game-load issue resolved.
- TypeScript build and all package builds pass.

### Known Issues

- CAD is still single-unit dispatch per call; multi-dispatch from CAD is planned.
- AI dispatch assistant and true multiplayer remain placeholders.
- Settings speed slider requires pause/resume to take effect.

---

## v0.6.2 — "Speed & Pause Patch" (Beta Hotfix)

**Release Date:** August 2, 2026
**Status:** Beta / Public Test Build
**Codename:** Speed & Pause Patch
**URL:** https://dispatch-hq.onrender.com

### Overview

v0.6.2 fixes the remaining friction in the settings/pause flow: the simulation-speed slider now takes effect instantly, and opening the pause screen truly suspends the game loop instead of leaving it running behind the overlay.

### What's New

#### Settings

- **Live simulation-speed changes** — sliding the speed control in the Settings modal immediately restarts the game-loop timer, so units move and mission timers accelerate or slow without needing a restart.
- Settings changes broadcast a `dispatch-settings-change` event; `file App.tsx` listens and recreates the 1Hz loop at the new interval.

#### Pause

- **Pause now pauses** — while the pause overlay is open, the main 1-second mission/unit loop is suspended.
- The 10Hz unit-position update loop and patrol/return logic are also gated behind `!showPause`.
- The live settings-listener stays active, so speed changes while paused apply as soon as the player resumes.

#### Backend

- `/health` now reports version `0.6.2` to match the shipped release.

### Known Issues

- AI Dispatch Assistant remains offline/rule-based.
- True multiplayer, server-side leaderboards, and alliance play remain future features.

---

*End of Release Notes*

## v0.7.0 — "AI Advisor & HUD Cleanup" (Beta)

**Release Date:** August 2, 2026
**Status:** Beta / Public Test Build
**Codename:** AI Advisor & HUD Cleanup
**URL:** https://dispatch-hq.onrender.com

### Overview

v0.7.0 starts the next phase build by making the Dispatch Assistant actionable and cleaning up the two biggest visual-friction reports from the v0.6.2 beta.

### What's New

#### AI Dispatch Assistant

- **Live recommendations panel:** the Assistant now scans active calls, available units, and mission requirements, then lists one-click dispatch suggestions.
- **One-click dispatch:** pressing *Send recommended units* routes the closest matching units over real roads and assigns them to the call.
- **Chat still works:** the original offline chat answers triage, patrol-route, cross-service, and dispatch-assignment questions.

#### HUD / Overlay Fixes

- **Unit name callout gap:** moved the marker name badge higher so it no longer overlaps the unit icon.
- **Floating right rail:** relocated to the bottom-right, lowered z-index, and made it collapsible so it does not cover the map or top-bar controls.

### Known Issues

- True multiplayer, server-side leaderboards, and alliance play remain future features.
---

