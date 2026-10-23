import { describe, it, expect } from 'vitest';
import type { MissionTemplate } from '../types/mission';
import {
  FIRE_MISSIONS,
  POLICE_MISSIONS,
  EMS_MISSIONS,
  REWARD_BAND_PCT,
  medianRewardForDifficulty,
  rewardBandFor,
} from './missions';

const SERVICE_POOLS: { name: string; missions: MissionTemplate[] }[] = [
  { name: 'fire', missions: FIRE_MISSIONS },
  { name: 'police', missions: POLICE_MISSIONS },
  { name: 'ems', missions: EMS_MISSIONS },
];

describe('reward band helpers', () => {
  it('exposes the ±20% band constant', () => {
    expect(REWARD_BAND_PCT).toBe(0.2);
  });

  it('computes the median for odd and even tier sizes', () => {
    const odds = [
      { id: 'a', difficulty: 1, baseCredits: 60 } as MissionTemplate,
      { id: 'b', difficulty: 1, baseCredits: 90 } as MissionTemplate,
      { id: 'c', difficulty: 1, baseCredits: 120 } as MissionTemplate,
    ];
    expect(medianRewardForDifficulty(1, odds)).toBe(90);

    const evens = [
      { id: 'a', difficulty: 2, baseCredits: 140 } as MissionTemplate,
      { id: 'b', difficulty: 2, baseCredits: 220 } as MissionTemplate,
    ];
    expect(medianRewardForDifficulty(2, evens)).toBe(180);
  });

  it('returns 0 median for tiers with no missions', () => {
    expect(medianRewardForDifficulty(99, [])).toBe(0);
    expect(rewardBandFor(99, [])).toEqual({ min: 0, max: 0 });
  });

  it('draws the band ±20% around the median', () => {
    const pool = [
      { id: 'a', difficulty: 5, baseCredits: 1000 } as MissionTemplate,
      { id: 'b', difficulty: 5, baseCredits: 1400 } as MissionTemplate,
    ];
    const band = rewardBandFor(5, pool);
    expect(band.min).toBe(960); // 1200 × 0.8
    expect(band.max).toBe(1440); // 1200 × 1.2
  });

  it('bands XP too when field is baseXp (v0.27.0)', () => {
    const pool = [
      { id: 'a', difficulty: 5, baseCredits: 1000, baseXp: 100 } as MissionTemplate,
      { id: 'b', difficulty: 5, baseCredits: 1400, baseXp: 140 } as MissionTemplate,
    ];
    const band = rewardBandFor(5, pool, 'baseXp');
    expect(band.min).toBe(96); // 120 × 0.8
    expect(band.max).toBe(144); // 120 × 1.2
  });
});

describe('reward-band audit (v0.22.0 Task 2)', () => {
  it('keeps every template within ±20% of its difficulty-tier median', () => {
    const failures: string[] = [];
    for (const pool of SERVICE_POOLS) {
      const difficulties = [...new Set(pool.missions.map((m) => m.difficulty))].sort((a, b) => a - b);
      for (const difficulty of difficulties) {
        const { min, max } = rewardBandFor(difficulty, pool.missions);
        for (const m of pool.missions.filter((x) => x.difficulty === difficulty)) {
          if (m.baseCredits < min || m.baseCredits > max) {
            failures.push(`${pool.name}/${m.id}: ${m.baseCredits} outside ${min}–${max} (tier ${difficulty})`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('pins the re-tuned police outliers inside their bands explicitly', () => {
    const d1 = POLICE_MISSIONS.filter((m) => m.difficulty === 1);
    const band1 = rewardBandFor(1, d1);
    for (const m of d1) {
      expect(m.baseCredits, `${m.id} vs band ${band1.min}–${band1.max}`).toBeGreaterThanOrEqual(band1.min);
      expect(m.baseCredits, `${m.id} vs band ${band1.min}–${band1.max}`).toBeLessThanOrEqual(band1.max);
    }
    const d2 = POLICE_MISSIONS.filter((m) => m.difficulty === 2);
    const band2 = rewardBandFor(2, d2);
    for (const m of d2) {
      expect(m.baseCredits, `${m.id} vs band ${band2.min}–${band2.max}`).toBeGreaterThanOrEqual(band2.min);
      expect(m.baseCredits, `${m.id} vs band ${band2.min}–${band2.max}`).toBeLessThanOrEqual(band2.max);
    }
  });
});

describe('XP reward-band audit (v0.27.0)', () => {
  // BALANCE.md F3: the plan specified a "credit/XP midpoint", but only credits
  // were ever banded — baseXp was tuned by feel. This closes that gap with the
  // same ±20% rule, applied per service (matching the credit audit above).
  it('keeps every template baseXp within ±20% of its difficulty-tier XP median', () => {
    const failures: string[] = [];
    for (const pool of SERVICE_POOLS) {
      const difficulties = [...new Set(pool.missions.map((m) => m.difficulty))].sort((a, b) => a - b);
      for (const difficulty of difficulties) {
        const { min, max } = rewardBandFor(difficulty, pool.missions, 'baseXp');
        for (const m of pool.missions.filter((x) => x.difficulty === difficulty)) {
          if (m.baseXp < min || m.baseXp > max) {
            failures.push(`${pool.name}/${m.id}: ${m.baseXp} outside ${min}–${max} (tier ${difficulty})`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('airlift missions (v0.22.13)', () => {
  it('includes both airlift-capable EMS templates', () => {
    const airlift = EMS_MISSIONS.filter(
      (m) => m.id === 'remote_rescue_airlift' || m.id === 'highway_trauma_airlift',
    );
    expect(airlift).toHaveLength(2);
  });

  it('ranks difficulty ≥ 6 so victims come out CRITICAL (airlift eligible)', () => {
    for (const id of ['remote_rescue_airlift', 'highway_trauma_airlift']) {
      const m = EMS_MISSIONS.find((x) => x.id === id);
      expect(m, `missing ${id}`).toBeDefined();
      expect(m!.difficulty).toBeGreaterThanOrEqual(6);
      expect(m!.requirements.length).toBeGreaterThan(0);
    }
  });

  it('stays inside the reward band for its difficulty tier', () => {
    for (const id of ['remote_rescue_airlift', 'highway_trauma_airlift']) {
      const m = EMS_MISSIONS.find((x) => x.id === id)!;
      const tier = EMS_MISSIONS.filter((x) => x.difficulty === m.difficulty);
      const { min, max } = rewardBandFor(m.difficulty, tier);
      expect(m.baseCredits, `${id} vs band ${min}–${max}`).toBeGreaterThanOrEqual(min);
      expect(m.baseCredits, `${id} vs band ${min}–${max}`).toBeLessThanOrEqual(max);
    }
  });
});

describe('POI-matched templates (v0.22.18 audit)', () => {
  // Every player-placeable POI type must have a natural callout that can anchor
  // to it. These six fill the gaps found in the POI↔mission audit.
  const EXPECTED: { id: string; pool: MissionTemplate[]; poiTypes: string[] }[] = [
    // gas stations — fuel spill on the forecourt
    { id: 'fuel_spill', pool: FIRE_MISSIONS, poiTypes: ['road', 'commercial', 'retail'] },
    // restaurants & supermarkets — kitchen fires
    { id: 'kitchen_fire', pool: FIRE_MISSIONS, poiTypes: ['commercial', 'retail'] },
    // schools — police disturbance (school_emergency is already the EMS side)
    { id: 'school_disturbance', pool: POLICE_MISSIONS, poiTypes: ['school', 'public'] },
    // government buildings — threat response
    { id: 'government_threat', pool: POLICE_MISSIONS, poiTypes: ['public', 'commercial', 'high_rise'] },
    // restaurants & supermarkets — food poisoning
    { id: 'food_poisoning', pool: EMS_MISSIONS, poiTypes: ['commercial', 'retail'] },
    // stadiums, malls, churches, parks — crowd injuries
    { id: 'crowd_incident', pool: EMS_MISSIONS, poiTypes: ['public', 'commercial', 'park'] },
  ];

  it('registers each new POI-matched template in the right service pool', () => {
    for (const { id, pool } of EXPECTED) {
      const m = pool.find((x) => x.id === id);
      expect(m, `${id} missing from pool`).toBeDefined();
      expect(m!.requirements.length, `${id} must be answerable`).toBeGreaterThan(0);
    }
  });

  it('keeps each template inside its difficulty-tier reward band', () => {
    for (const { id, pool } of EXPECTED) {
      const m = pool.find((x) => x.id === id)!;
      const tier = pool.filter((x) => x.difficulty === m.difficulty);
      const { min, max } = rewardBandFor(m.difficulty, tier);
      expect(m.baseCredits, `${id} vs band ${min}–${max}`).toBeGreaterThanOrEqual(min);
      expect(m.baseCredits, `${id} vs band ${min}–${max}`).toBeLessThanOrEqual(max);
    }
  });

  it('anchors to the player-placeable POI type it was built for', () => {
    // Template poiTypes must share a bucket tag with the target POI's buckets
    // (POI_TYPE_META), so findAnchorPoi can attach the call to that landmark.
    const TARGET_POI_BUCKETS: Record<string, string[]> = {
      fuel_spill: ['road', 'commercial', 'retail'], // gas_station
      kitchen_fire: ['commercial', 'retail', 'road'], // restaurant / supermarket
      school_disturbance: ['school', 'residential', 'public'], // school
      government_threat: ['public', 'commercial', 'high_rise'], // government
      food_poisoning: ['commercial', 'retail', 'road'], // restaurant / supermarket
      crowd_incident: ['public', 'park', 'commercial'], // stadium / mall / church
    };
    for (const { id, pool } of EXPECTED) {
      const m = pool.find((x) => x.id === id)!;
      const shared = m.poiTypes.filter((p) => TARGET_POI_BUCKETS[id].includes(p));
      expect(shared.length, `${id} must share a bucket with its target POI`).toBeGreaterThan(0);
    }
  });
});
