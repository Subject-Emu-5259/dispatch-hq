# Belt Bounty — Program & Ops Reference (pointer)

> The **canonical** program + ops reference moved with the workspace to
> `~/Projects/belt-bounty/docs/BELT-BOUNTY.md` (this repo's ops extracted into
> its own git repo). Keep this page as a pointer + summary only — update the
> canonical file, then mirror any changes here and in
> `.pandaos/skills/belt-bounty/SKILL.md`.

## What this is

inference.sh runs a recurring bounty (`belt app promo`): build a **useful**
app, deploy it with `belt app deploy`, and claim **$5** with
`belt app promo submit <namespace>/<app-name>` (namespace `subjectemu5259`).

Rules: the app must be useful and not already exist; Python or Node; submitting
makes it **public**; **1 bounty per day**.

Dispatch HQ runs this as a self-contained ops pipeline that ships one useful,
battle-tested utility per day — a near-passive revenue stream built out of
logic already proven by this repo's unit tests. **$30 earned to date** (6
submitted apps as of 2026-08-22).

## Where it lives now

- Ops workspace (own git repo): `~/Projects/belt-bounty/`
  - Driver: `run-daily.sh` (idempotent, 8-step loop, daily lock)
  - Scheduler A: launchd 9am (`install.sh` → `~/.local/share/belt-bounty/`)
  - Scheduler B: always-on cron on the Zo computer (`zo-sync.sh` →
    `/root/.local/share/belt-bounty/`, base64-chunked push via `/zo/ask`)
  - Queue: `candidates/NN-slug/{inf.yml, inference.js, test-input.json}`
  - Tests: `tests/test-run-daily.sh` (fake belt CLI, no platform calls)
- Agent-facing trigger doc: `.pandaos/skills/belt-bounty/SKILL.md`
- Program reference: `~/Projects/belt-bounty/docs/BELT-BOUNTY.md`

## Quick run

```bash
export PATH="$HOME/.local/bin:$PATH"
cd ~/Projects/belt-bounty
./run-daily.sh --dry-run   # everything short of deploy/submit
./run-daily.sh             # real run (deploy + submit)
./run-daily.sh --force     # ignore the daily lock
```

After editing candidates or the driver: `./install.sh --run` (Mac launchd) and
`./zo-sync.sh` (Zo cron).

## Gotchas (summary)

- Both `inference.js` paths required — root AND `src/` (deploy gate).
- Dedupe ignores our own namespace (deploy-then-submit makes our app appear in
  search); matches `no apps matching` / `no apps found` for foreign apps.
- `already_today` must NOT consume the candidate (retries tomorrow).
- `$0.50` minimum balance gate; `belt feedback` surveys pay $1 if empty.
- plist + zo-sync hardcode `/Users/deandrewharris/...` — update per machine.
