# City Traits System — Design Spec

> **Status:** Draft  
> **First prototype:** Paris (v0.36.0)  
> **Author:** Buffy (auto)

---

## 1. Problem

Cities currently differ only in cosmetics: street names, landmarks, district labels, boundary shape, and trauma referral. A player in Paris plays identically to a player in West Memphis — same spawn rates, same fire density, same response times, same mission mix. The city choice is flavor, not strategy.

**Goal:** Make city choice *matter* — each city should feel different to play, with mechanics that reward understanding the city's character.

---

## 2. Design Principles

1. **Additive, not subtractive** — traits layer on top of existing behavior (weather, events, spawn, settings). No trait should *remove* content or make a city unplayable.
2. **Visible to players** — the trait is named, described in the city picker, and its effects are perceivable in gameplay (more fires, slower response, different mission mix).
3. **Balanced tradeoffs** — every trait has a downside. Dense cities spawn more fires but also more EMS calls. Congested cities slow response but offer more credit bonuses for fast clears.
4. **Data-driven** — traits are defined in a single registry (`cityTraits.ts`) with numeric multipliers, not scattered conditionals. Adding a new trait = adding one entry.
5. **Composable** — multiple traits can stack (e.g., a future "coastal" trait + the existing "density" trait). The modifier pipeline already supports this via the weather/event multiplier chain.

---

## 3. Architecture

### 3.1 New Module: `cityTraits.ts`

```ts
export interface CityTrait {
  /** Human-readable name shown in the city picker. */
  name: string;
  /** One-line description for the tooltip. */
  description: string;
  /** Which gameplay systems this trait modifies. */
  modifiers: {
    /** Multiplier on structure-fire spawn weight (1.0 = baseline). */
    fireSpawnWeight?: number;
    /** Multiplier on EMS spawn weight. */
    emsSpawnWeight?: number;
    /** Multiplier on police spawn weight. */
    policeSpawnWeight?: number;
    /** Additive modifier on response time (seconds). Positive = slower. */
    responseTimeDelta?: number;
    /** Multiplier on travel time (1.0 = baseline). */
    travelTimeMultiplier?: number;
    /** Multiplier on spawn rate (missions per interval). */
    spawnRateMultiplier?: number;
    /** Multiplier on credits earned per mission. */
    creditsMultiplier?: number;
    /** Multiplier on XP earned per mission. */
    xpMultiplier?: number;
    /** Extra mission categories that get a spawn boost. */
    categoryBoosts?: Record<string, number>;
  };
}

export const CITY_TRAITS: Record<string, CityTrait> = { ... };
export function getCityTrait(cityName: string): CityTrait | undefined { ... }
```

### 3.2 Hook Points (minimal changes)

| System | Current | Trait Hook |
|--------|---------|------------|
| `spawn.ts` → `capTemplateRarity` | Weather multiplies spawn weights | `getCityTrait` adds `fireSpawnWeight` / `emsSpawnWeight` / `policeSpawnWeight` to the same multiplier chain |
| `spawn.ts` → `buildMission` | Weather + seasonal boost | `categoryBoosts` applied to `maxWeight` before `pickWeightedTemplate` |
| `App.tsx` → spawn interval | `getMissionPaceMs()` | `spawnRateMultiplier` from trait scales the interval |
| `App.tsx` → mission completion | Credits/XP from template | `creditsMultiplier` / `xpMultiplier` applied at completion time |
| `RandomEvents.tsx` → `getActiveEffects` | responseTimeMultiplier, travelTimeMultiplier | Trait modifiers added to the same effects object (stack multiplicatively with weather/events) |
| City picker (`CitySelectionScreen.tsx`) | Shows name + tagline | Shows trait name + description |
| `cityProgression.ts` | minLevel + tagline | No change — trait is separate from unlock level |

### 3.3 Modifier Pipeline

The existing modifier chain is:

```
base spawn weight
  × weather spawn weight
  × seasonal boost
  × city trait spawn weight    ← NEW
  → pickWeightedTemplate
```

For response time:

```
base response time
  × weather response multiplier
  × event response multiplier
  × city trait travel time multiplier    ← NEW
  + city trait response time delta       ← NEW
```

For credits/XP:

```
base credits
  × event credits multiplier
  × city trait credits multiplier    ← NEW
```

This means traits compose naturally with weather and events — a storm in Paris stacks with the density trait, making fires even more intense.

---

## 4. First Prototype: Paris — "Urban Density"

### 4.1 The Trait

**Name:** Urban Density  
**Description:** "Paris packs 2.1 million people into 105 km² — the densest city in Europe. Structure fires spread faster, EMS calls are constant, and the périphérique clogs response times. But密度 means more incidents, more credits, and the city always needs you."

### 4.2 Modifiers

| Modifier | Value | Rationale |
|----------|-------|-----------|
| `fireSpawnWeight` | 1.4 | Dense Haussmannian buildings, older wiring, narrow streets = more structure fires |
| `emsSpawnWeight` | 1.3 | High population density = more medical calls per km² |
| `policeSpawnWeight` | 1.0 | No change — Paris police density is already high |
| `responseTimeDelta` | +3s | Périphérique congestion, narrow streets, tourist crowds slow response |
| `travelTimeMultiplier` | 1.12 | 12% slower travel on average (congestion, one-way systems, pedestrian zones) |
| `spawnRateMultiplier` | 1.15 | 15% more missions per interval — dense cities are busy |
| `creditsMultiplier` | 1.1 | 10% bonus credits — harder city, better pay |
| `xpMultiplier` | 1.05 | 5% XP bonus — learning a dense city is worth more |

### 4.3 What Players Will Notice

1. **More fires on the board** — structure fires appear ~40% more often than in West Memphis. The dispatch board feels busier, especially for fire-service players.
2. **More EMS calls** — medical calls are constant. A fire/EMS cross-service player will be busier than in any US city.
3. **Slower response** — units take ~12% longer to reach scenes. The périphérique and narrow streets make station placement more strategic — you can't just plop a station anywhere and expect fast response.
4. **More missions overall** — 15% faster spawn rate means the board fills up quicker. The player needs to prioritize and triage.
5. **Better rewards** — 10% credit bonus and 5% XP bonus compensate for the harder gameplay. Paris is harder but more rewarding.

### 4.4 Balance Notes

- The response time delta (+3s) is additive, not multiplicative — it affects all missions equally regardless of distance. This means short-range responses are disproportionately affected (a 20s response becomes 23s = 15% slower), while long-range responses are less affected (a 60s response becomes 63s = 5% slower). This feels right — congestion hurts short hops more.
- The spawn rate multiplier (1.15) is modest — enough to feel busier but not overwhelming. Combined with the fire/EMS boosts, Paris will have ~50-60% more active calls than West Memphis at the same mission pace setting.
- The credit/XP bonuses (1.1/1.05) are small enough that players won't feel punished for choosing easier cities, but large enough that experienced players are incentivized to try Paris.

---

## 5. Future Traits (templates for v0.36.x+)

### London — "Congestion Zone"
- `responseTimeDelta: +4s` (Congestion Charge zone, narrow streets, double-decker buses)
- `travelTimeMultiplier: 1.15`
- `policeSpawnWeight: 1.3` (Met Police handles more call types)
- `creditsMultiplier: 1.12`

### Berlin — "Cold War Grid"
- `fireSpawnWeight: 0.9` (modern buildings, good fire codes)
- `emsSpawnWeight: 1.1` (aging population in eastern boroughs)
- `travelTimeMultiplier: 0.95` (wide boulevards, excellent public transit = faster response)
- `xpMultiplier: 1.08`

### Chicago — "Windy City"
- `fireSpawnWeight: 1.5` (the highest — Chicago's fire tradition is real)
- `responseTimeDelta: +2s` (Lake Effect weather, gridlock)
- `creditsMultiplier: 1.08`

### Houston — "Sprawl"
- `travelTimeMultiplier: 1.2` (massive city, highway-dependent)
- `fireSpawnWeight: 1.2` (industrial corridor)
- `spawnRateMultiplier: 0.9` (spread out = fewer incidents per km²)

### Tokyo — "23 Wards"
- `spawnRateMultiplier: 1.3` (the most intense)
- `emsSpawnWeight: 1.4` (aging population)
- `travelTimeMultiplier: 0.9` (excellent rail = fast response)
- `creditsMultiplier: 1.15`

---

## 6. Implementation Plan

### Phase 1: Data Layer (v0.36.0)
1. Create `cityTraits.ts` with the `CityTrait` interface and Paris entry
2. Create `cityTraits.test.ts` — verify Paris modifiers, verify no-trait cities return undefined
3. Add `getCityTrait` to the city picker display (trait name + description in tooltip)

### Phase 2: Spawn Integration (v0.36.0)
4. In `spawn.ts` → `capTemplateRarity`: apply `fireSpawnWeight` / `emsSpawnWeight` / `policeSpawnWeight` to the template weight multiplier chain
5. In `spawn.ts` → `buildMission`: apply `categoryBoosts` if present
6. In `App.tsx` → spawn interval: apply `spawnRateMultiplier` to `getMissionPaceMs()`

### Phase 3: Response/Reward Integration (v0.36.0)
7. In `RandomEvents.tsx` → `getActiveEffects`: add trait `travelTimeMultiplier` to the effects chain
8. In `App.tsx` → mission completion: apply `creditsMultiplier` / `xpMultiplier`
9. In routing: apply `responseTimeDelta` as additive seconds to estimated arrival time

### Phase 4: UI (v0.36.0)
10. City picker shows trait name + description
11. Post-mission screen shows "Density Bonus: +10% credits" when applicable
12. Shift report mentions the trait effect ("Paris density increased call volume by 15%")

### Phase 5: Balance Pass (v0.36.1)
13. Playtest Paris with all three services
14. Adjust multipliers based on feel
15. Add trait indicators to the dispatch board (optional: fire icon for boosted fire spawn)

---

## 7. Testing Strategy

- **Unit tests:** `cityTraits.test.ts` — verify modifier values, verify no-trait fallback
- **Spawn tests:** Verify Paris fire spawn weight is 1.4× baseline in `spawn.test.ts`
- **Balance tests:** Verify response time delta is applied in the routing pipeline
- **E2E:** Extend `paris-city.mjs` to verify the trait is active (check spawn rate or credit bonus)
- **Manual:** Play Paris for 10 minutes with each service, compare to West Memphis

---

## 8. Open Questions

1. **Should traits be visible in the mission card?** (e.g., "🔥 Dense Urban Area — fire risk elevated") — this would teach players about the trait organically
2. **Should traits affect station placement?** (e.g., Paris density means stations should be closer together) — this is a bigger change but would make the trait more impactful
3. **Should traits be unlockable?** (e.g., you don't get the density trait until L18 in Paris) — this would gate the difficulty increase but adds complexity
4. **Should traits stack with weather?** (storm + density = extreme fire risk) — the current architecture supports this naturally, but is it too hard?

---

## 9. Success Metrics

- Players in Paris should have ~15-20% higher mission completion rate than West Memphis (more missions, more rewards)
- Players should notice the difference within 2 minutes of gameplay
- The trait should not make Paris unplayable — response times should still be manageable with good station placement
- The trait should be mentioned in at least 50% of Paris shift reports (via the "Density Bonus" indicator)
