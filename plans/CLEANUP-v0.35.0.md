# Dispatch HQ — v0.35.0 Cleanup Log

**Date:** 2026-08-25  
**Before:** 3.7GB (excluding node_modules, .git)  
**After:** 1.9GB  
**Savings:** 1.8GB (49%)

---

## What Was Cleaned

### 1. `apps/desktop/release/` — 1.4GB → 0

Electron build artifacts (dmg, exe, AppImage, unpacked binaries). These are **identical** to `dist/` (verified via MD5 hash: `de04cd32b462394f8d633cbfa4b600bd`). The `dist/` directory is kept because `scripts/deploy.sh` section 10 reads from it for itch.io butler pushes.

**Why it existed:** Electron builder outputs to `release/` by default. The `publish-itch.sh` script copies from `dist/`, so `release/` was redundant.

### 2. `.turbo/` — 380MB → 0

Turborepo build cache. Safe to delete — rebuilds on next `pnpm build`.

### 3. `.record-tmp/` — 20MB → 0

Freebuff recording tool temp files (screenshots, HTML captures, probe scripts). All untracked, never committed.

### 4. `docs/` screenshots + videos — 29MB → 50KB

- `docs/Dispatch HQ in Game Screenshot/` — 7.6MB of PNG screenshots (11 files)
- `docs/walkthrough/` — 8.5MB of MP4 videos (2 files)
- `docs/promo/` — 13MB of JPG/PNG promo images (6 files)

**Kept:** All `.md` docs (64KB total) — ARCHITECTURE.md, DEVELOPMENT.md, BALANCE.md, DESKTOP.md, ITCH-IO.md, README.md, BELT-BOUNTY.md.

**Note:** The promo images for itch.io are stored in the itch dashboard, not the repo. The OG image (`apps/web/public/og-1200x630.jpg`) is still live at 239KB.

---

## What Was NOT Cleaned

| Path | Size | Why kept |
|------|------|----------|
| `dist/` | 526MB | Required by `publish-itch.sh` for butler pushes |
| `node_modules/` | 1.1GB | Required for dev |
| `.git/` | 66MB | Version control |
| `apps/web/public/og-1200x630.jpg` | 239KB | Live OG image served by the app |

---

## Final Size Breakdown

| Component | Size |
|-----------|------|
| `apps/` | 30MB (web only) |
| `node_modules/` | 1.1GB |
| `dist/` | 526MB |
| `.git/` | 66MB |
| `docs/` | 50KB |
| `plans/` | 4.2MB |
| Everything else | < 5MB |
| **Total** | **~1.9GB** |
