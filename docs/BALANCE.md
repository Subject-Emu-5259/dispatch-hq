# Dispatch HQ — Reward Balance Analysis

Cross-check of **actual mission payouts** against the **shared `REWARD` bands** specified in
[`plans/v0.18.0-release-readiness.md`](../plans/v0.18.0-release-readiness.md) (Step 4, Task 1).
Computed from the live template data (`packages/shared/src/constants/missions.ts`) and the payout
pipeline (`apps/web/src/lib/spawn.ts` + `lib/rewards.ts`). Last verified: **v0.27.0**.

## Banding model

- Every template's `baseCredits` **and** `baseXp` is checked against its difficulty tier's band:
  `±REWARD_BAND_PCT (0.2)` around the tier's **median**, per **service** (fire / police / EMS) —
  exactly what `rewardBandFor(difficulty, missions, field)` implements in shared.
- Bands are computed **per service**, not across all 53 templates pooled together. Each service has
  its own reward curve (fire pays more than police per tier, etc.), so a D5 fire call is compared to
  other D5 fire calls, not to D5 EMS calls. The original v0.19.x analysis pooled all services, which
  inflated the apparent outlier count — see F3 below.
- Spawned missions copy the template's reward 1:1
  (`spawn.ts`: `creditsReward = round(baseCredits × (1 + (difficulty − template.difficulty) × 0.15))`,
  the +1 difficulty roll lands ~8% of the time and moves payouts +15% — still inside the ±20%
  band), so template compliance **is** the base reward players receive.
- Final payouts are then scaled by the multiplier stack in `lib/rewards.ts` (F5, unchanged).

## Status: all four v0.18 findings are now closed

| Finding | Issue | Status |
|---|---|---|
| **F1** | Credits out of band (10 of 38) | ✅ Resolved in **v0.22.0** — per-service credit audit |
| **F2** | D6 tier pays less than D5 (non-monotonic) | ✅ Resolved — per-service medians now strictly increasing |
| **F3** | XP not banded (16 of 38 under pooled model) | ✅ Resolved in **v0.27.0** — XP band + 8 outliers re-tuned |
| **F4** | `garage_fire > room_fire` vs in-band contradiction | ✅ Resolved — no longer contradictory (see below) |
| **F5** | Payout multiplier stack | ℹ️ Informational, unchanged |

## What changed

### F1 — Credits banded (v0.22.0)

`packages/shared/src/constants/missions.test.ts` now runs a per-service audit
(`reward-band audit (v0.22.0 Task 2)`) that asserts **every** template's `baseCredits` sits within
±20% of its per-service difficulty-tier median. The old "only `wildfire` is tested" gap is gone:
the audit iterates all three service pools and every difficulty tier, and fails loudly with the
full out-of-band list on regression.

### F2 — Monotonic tier curve

The old D5→D6 dip was an artifact of the pooled model: `garage_fire` was jacked to 1 700 against a
pooled D6 median of 700. Under the per-service model the curve is monotonic:

- **Fire** credits: 110 · 175 · 390 · 425 · 1 200 · 1 700 · 2 000 · 4 000 · 6 250 · 10 000
- **Police** credits: 90 · 180 · 240 · 310 · — · 500 · 1 300 · — · 2 000
- **EMS** credits: 100 · 200 · 310 · 400 · 425 · 700 · 1 300 · … · 2 500

`constants.test.ts` also enforces this directly with *"reward follows difficulty — no mission
out-earns the most expensive mission one tier above"*.

### F3 — XP banded (v0.27.0)

`medianRewardForDifficulty` / `rewardBandFor` gained a `field` argument (`'baseCredits' | 'baseXp'`,
defaulting to `'baseCredits'`), so the same ±20% rule now applies to XP. A new per-service audit
(`XP reward-band audit (v0.27.0)`) mirrors the credit audit. Eight XP outliers were re-tuned into
band (credits were already correct, so no credit value moved):

| Template | Tier | Old XP | New XP |
|---|---|---|---|
| `traffic_stop` (police) | D1 | 10 | 15 |
| `theft_in_progress` (police) | D1 | 25 | 20 |
| `signal_malfunction` (police) | D2 | 25 | 30 |
| `dui_checkpoint` (police) | D2 | 45 | 40 |
| `stolen_vehicle` (police) | D3 | 55 | 50 |
| `kitchen_fire` (fire) | D3 | 80 | 60 |
| `brush_fire` (fire) | D4 | 140 | 85 |
| `water_rescue` (EMS) | D5 | 160 | 100 |

The two v0.26.0 templates the prior pass missed (`brush_fire`, `water_rescue`) are the two fire/EMS
rows above; the other six are pre-existing outliers the credit-only pass never caught.

### F4 — The contradiction no longer applies

The v0.18 plan demanded both (a) `garage_fire` in-band **and** (b) `garage_fire` above `room_fire`.
Under the pooled model these clashed (D6 median 700 → band max 840 vs `garage_fire` 1 700). Under
the per-service model **fire D6 is `garage_fire` alone** (median 1 700, band 1 360–2 040), so
`garage_fire` (1 700) is in-band *and* above `room_fire` (1 400). Both goals hold simultaneously, so
the `garage_fire > room_fire` assertion in `constants.test.ts` is now consistent with the band audit
rather than a special case that blocks it.

### F5 — Payout stack (unchanged)

Live payouts scale base rewards by: tech `×1.25` (e3) · speed `×1.0–1.5` (remaining-time ratio) ·
chain `×1.25` (stage ≥ 2) · rank `×1.0–1.4` (rookie → commissioner) · alliance commander
`×1.0–1.2` · mutual aid `×1.25`. Every component except the speed bonus is gated by progression
(L20 rank, alliance level, chain completion, cross-service play), so it scales with investment.
The speed bonus is easier to stack on low-difficulty calls (fewer units, faster clears) — a mild
pull toward easy calls, but at typical stacks the tier curve still dominates the ordering.

## Later templates are banded too

Every template added since the retune passes the same audits:

- **v0.25.0**: multi-alarm fire, high-speed pursuit, barricade situation, school emergency,
  hazmat medical.
- **v0.26.0**: brush fire, water rescue (credits in-band from the start; XP pulled into band in
  v0.27.0).
- **v0.27.0**: `chemical_chain` (fuel spill → hazmat medical → chemical fire) reuses existing
  templates, so it inherits their banded credits/XP.

## Verification

- `pnpm --filter @dispatch-hq/shared exec vitest run src/constants/missions.test.ts src/constants/constants.test.ts src/constants/chainMissions.test.ts`
  — the credit audit, XP audit, monotonicity test, and chain integrity all green.
