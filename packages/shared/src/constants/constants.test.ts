import { describe, it, expect } from 'vitest';
import {
  ECONOMY,
  PREMIUM,
  UNIT_CONFIGS,
  STATION_CONFIGS,
  STATION_LEVELS,
  FIRE_MISSIONS,
  POLICE_MISSIONS,
  EMS_MISSIONS,
  MISSION_SPAWN_CONFIG,
  getMissionsForService,
  getMissionPriority,
  MISSION_PRIORITY_RANK,
  getTrafficDutyTemplates,
  ROAD_POI_TYPES,
  RECOVERY_TEMPLATES,
  REWARD_BAND_PCT,
  rewardBandFor,
  cumulativeXpForLevel,
  levelForXp,
  xpIntoLevel,
  levelBonusFor,
  advanceLevel,
  xpRequiredForNextLevel,
  stationServiceFor,
  partnerStationDiscountForLevel,
  MAX_UNIT_SPEED_MPH,
  premiumCreditMultiplier,
  premiumTrainingMultiplier,
  skipTrainingCost,
  creditsForCoins,
  COIN_SKIP_TRAINING_SECONDS_PER_COIN,
  COIN_CREDITS_RATE,
} from '../index';

describe('Economy Constants', () => {
  it('has starting credits of 10000', () => {
    expect(ECONOMY.startingCredits).toBe(10000);
  });

  it('has 20 XP levels defined (v0.18.0 progression depth)', () => {
    expect(ECONOMY.xpPerLevel).toHaveLength(20);
    expect(ECONOMY.xpPerLevel[0]).toBe(0);
  });

  it('XP requirements increase monotonically', () => {
    for (let i = 1; i < ECONOMY.xpPerLevel.length; i++) {
      expect(ECONOMY.xpPerLevel[i]).toBeGreaterThan(ECONOMY.xpPerLevel[i - 1]);
    }
  });

  it('level bonuses increase monotonically starting at 1.0', () => {
    expect(ECONOMY.levelBonus[0]).toBe(1.0);
    for (let i = 1; i < ECONOMY.levelBonus.length; i++) {
      expect(ECONOMY.levelBonus[i]).toBeGreaterThan(ECONOMY.levelBonus[i - 1]);
    }
  });

  it('xpPerLevel and levelBonus arrays have matching length', () => {
    expect(ECONOMY.xpPerLevel.length).toBe(ECONOMY.levelBonus.length);
  });

  it('level ladder helpers walk the extended curve to level 20', () => {
    // Cumulative XP to reach level 10 is 18200; level 11 starts at +7500.
    expect(cumulativeXpForLevel(10)).toBe(18200);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(18200)).toBe(10);
    expect(levelForXp(18201)).toBe(10); // level 11 needs cumulative 25700
    expect(levelForXp(25700)).toBe(11);
    // Way past the top of the table clamps to level 20.
    expect(levelForXp(999999999)).toBe(20);
    expect(xpIntoLevel(18200)).toBe(5500); // 5500 XP into level 10
    expect(xpIntoLevel(25700)).toBe(7500); // completed the level-11 grind
    expect(levelBonusFor(20)).toBe(2.0);
    expect(levelBonusFor(5)).toBe(1.2);
    expect(levelBonusFor(99)).toBe(2.0); // clamps
  });

  it('advanceLevel applies earned XP through the shared curve (v0.19)', () => {
    // Level 1 -> 2 needs 100 XP into the level.
    expect(advanceLevel(1, 0, 100)).toEqual({ level: 2, xpIntoLevel: 0 });
    expect(advanceLevel(1, 0, 99)).toEqual({ level: 1, xpIntoLevel: 99 });
    // A larger grant can leap multiple levels at once.
    expect(advanceLevel(1, 50, 450)).toEqual({ level: 3, xpIntoLevel: 100 });
    // Carries over existing remainder before consuming new XP.
    expect(advanceLevel(5, 900, 100)).toEqual({ level: 5, xpIntoLevel: 1000 });
    // Overflow from the remainder plus grant levels up exactly once.
    expect(advanceLevel(5, 900, 700)).toEqual({ level: 6, xpIntoLevel: 100 });
    // Clamps at the level-20 cap: XP piles up in the final level.
    expect(advanceLevel(20, 500, 99999)).toEqual({ level: 20, xpIntoLevel: 100499 });
    // Explicit level grants can never push past the cap either (v0.19 fix).
    expect(advanceLevel(21, 500, 0)).toEqual({ level: 20, xpIntoLevel: 500 });
    expect(advanceLevel(99, 500, 0)).toEqual({ level: 20, xpIntoLevel: 500 });
    // Zero / negative grants are no-ops that preserve state.
    expect(advanceLevel(7, 250, 0)).toEqual({ level: 7, xpIntoLevel: 250 });
    expect(advanceLevel(7, 250, -50)).toEqual({ level: 7, xpIntoLevel: 250 });
  });

  it('advanceLevel preserves migration-safe remainder semantics for existing saves', () => {
    // A player who leveled under the old flat curve carries their stored
    // remainder forward — the curve only affects how NEW XP levels up.
    const saved = advanceLevel(12, 3400, 500);
    expect(saved.level).toBe(12); // 3400 + 500 = 3900 < 10000 needed for 13
    expect(saved.xpIntoLevel).toBe(3900);
    // When a stored remainder already exceeds the curve threshold (legacy
    // flat-curve remainders could reach level*1000 - 1), the next XP event
    // realizes the catch-up level instead of losing progress.
    const catchUp = advanceLevel(10, 9999, 1); // level 10 needs 7500 for 11
    expect(catchUp.level).toBe(11);
    expect(catchUp.xpIntoLevel).toBe(2500); // 10000 - 7500
  });

  it('xpRequiredForNextLevel returns the curve delta and Infinity at the cap', () => {
    expect(xpRequiredForNextLevel(1)).toBe(100);
    expect(xpRequiredForNextLevel(5)).toBe(1500);
    expect(xpRequiredForNextLevel(19)).toBe(72000);
    expect(xpRequiredForNextLevel(20)).toBe(Infinity);
    expect(xpRequiredForNextLevel(99)).toBe(Infinity);
  });

  it('lifetime XP is strictly level-first — level order equals lifetime order', () => {
    // Lifetime XP = cumulative to reach the level + remainder into it. The max
    // remainder at level L is xpPerLevel[L] - 1, which is always less than the
    // requirement to reach L+1, so any player at L+1 out-ranks any player at L.
    // This is the invariant the leaderboard's (level DESC, xp DESC) sort relies
    // on — if it breaks, the xp leaderboard ranking is meaningless again.
    const lifetimeAt = (level: number, remainder: number) =>
      cumulativeXpForLevel(level) + remainder;
    for (let level = 1; level < ECONOMY.xpPerLevel.length; level++) {
      const maxRemainder = ECONOMY.xpPerLevel[level] - 1;
      const bestBelow = lifetimeAt(level, maxRemainder);
      const worstAbove = lifetimeAt(level + 1, 0);
      expect(
        bestBelow < worstAbove,
        `level ${level} max lifetime (${bestBelow}) must stay below level ${level + 1} min (${worstAbove})`
      ).toBe(true);
    }
  });
});

describe('Premium Config', () => {
  it('has a monthly price > 0', () => {
    expect(PREMIUM.monthlyPrice).toBeGreaterThan(0);
  });

  it('has credit multiplier > 1', () => {
    expect(PREMIUM.creditMultiplier).toBeGreaterThan(1);
  });

  it('has training speed multiplier > 1', () => {
    expect(PREMIUM.trainingSpeedMultiplier).toBeGreaterThan(1);
  });
});

describe('Unit Constants', () => {
  it('has 12 unit types defined', () => {
    expect(Object.keys(UNIT_CONFIGS)).toHaveLength(12);
  });

  it('all units have required fields', () => {
    for (const [key, config] of Object.entries(UNIT_CONFIGS)) {
      expect(config.type, `Unit ${key}`).toBe(key);
      expect(config.name, `Unit ${key}`).toBeTruthy();
      expect(config.description, `Unit ${key}`).toBeTruthy();
      expect(config.icon, `Unit ${key}`).toBeTruthy();
      expect(config.speed, `Unit ${key}`).toBeGreaterThan(0);
      expect(config.capacity, `Unit ${key}`).toBeGreaterThan(0);
      expect(config.cost, `Unit ${key}`).toBeGreaterThan(0);
      expect(config.unlockLevel, `Unit ${key}`).toBeGreaterThanOrEqual(1);
      expect(config.trainingTime, `Unit ${key}`).toBeGreaterThan(0);
    }
  });

  it('all expected unit types exist', () => {
    expect(UNIT_CONFIGS.engine).toBeDefined();
    expect(UNIT_CONFIGS.ladder).toBeDefined();
    expect(UNIT_CONFIGS.rescue).toBeDefined();
    expect(UNIT_CONFIGS.battalion_chief).toBeDefined();
    expect(UNIT_CONFIGS.patrol_car).toBeDefined();
    expect(UNIT_CONFIGS.swat_van).toBeDefined();
    expect(UNIT_CONFIGS.k9_unit).toBeDefined();
    expect(UNIT_CONFIGS.police_suv).toBeDefined();
    expect(UNIT_CONFIGS.ambulance).toBeDefined();
    expect(UNIT_CONFIGS.paramedic_unit).toBeDefined();
    expect(UNIT_CONFIGS.ems_supervisor).toBeDefined();
    expect(UNIT_CONFIGS.fire_ambulance).toBeDefined();
  });

  it('higher unlock level units tend to cost more', () => {
    expect(UNIT_CONFIGS.battalion_chief.cost).toBeGreaterThan(UNIT_CONFIGS.engine.cost);
  });
});

describe('Station Constants', () => {
  it('has 3 station types', () => {
    expect(Object.keys(STATION_CONFIGS)).toHaveLength(3);
  });

  it('all stations have valid hex colors', () => {
    for (const [key, config] of Object.entries(STATION_CONFIGS)) {
      expect(config.color, `Station ${key}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(config.baseCost, `Station ${key}`).toBeGreaterThan(0);
    }
  });

  it('has 5 station levels', () => {
    expect(STATION_LEVELS).toHaveLength(5);
  });

  it('station levels increase monotonically', () => {
    for (let i = 1; i < STATION_LEVELS.length; i++) {
      expect(STATION_LEVELS[i].cost).toBeGreaterThan(STATION_LEVELS[i - 1].cost);
      expect(STATION_LEVELS[i].capacity).toBeGreaterThan(STATION_LEVELS[i - 1].capacity);
      expect(STATION_LEVELS[i].coverageRadius).toBeGreaterThan(STATION_LEVELS[i - 1].coverageRadius);
    }
  });

  it('level 1 cost is 0', () => {
    expect(STATION_LEVELS[0].cost).toBe(0);
    expect(STATION_LEVELS[0].level).toBe(1);
  });
});

describe('Mission Constants', () => {
  it('has 17 fire missions (13 base + kitchen fire + fuel spill + multi-alarm fire + brush fire, v0.26.0)', () => {
    expect(FIRE_MISSIONS).toHaveLength(17);
  });

  it('has 18 police missions (14 base + school disturbance + government threat + high-speed pursuit + barricade, v0.25.0)', () => {
    expect(POLICE_MISSIONS).toHaveLength(18);
  });

  it('has 19 EMS missions (11 base + 2 airlift-capable + food poisoning + crowd incident + school emergency + hazmat medical + water rescue + bus crash, v0.30.0)', () => {
    expect(EMS_MISSIONS).toHaveLength(19);
  });

  it('all missions have required fields and positive rewards', () => {
    const allMissions = [...FIRE_MISSIONS, ...POLICE_MISSIONS, ...EMS_MISSIONS];
    for (const m of allMissions) {
      expect(m.id, `Mission`).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(m.category).toBeTruthy();
      expect(m.baseCredits).toBeGreaterThan(0);
      expect(m.baseXp).toBeGreaterThan(0);
      expect(m.difficulty).toBeGreaterThanOrEqual(1);
      expect(m.requirements.length).toBeGreaterThan(0);
      expect(m.estimatedDuration).toBeGreaterThan(0);
    }
  });

  it('all mission IDs are unique', () => {
    const allIds = [...FIRE_MISSIONS, ...POLICE_MISSIONS, ...EMS_MISSIONS].map(m => m.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('every requirement references a valid unit type', () => {
    const allMissions = [...FIRE_MISSIONS, ...POLICE_MISSIONS, ...EMS_MISSIONS];
    const validUnitTypes = new Set(Object.keys(UNIT_CONFIGS));
    for (const m of allMissions) {
      for (const req of m.requirements) {
        expect(validUnitTypes.has(req.unitType), `Unknown unit type: ${req.unitType} in ${m.id}`).toBe(true);
      }
    }
  });

  it('police_suv and battalion_chief are referenced by at least one mission (no orphan units)', () => {
    const allMissions = [...FIRE_MISSIONS, ...POLICE_MISSIONS, ...EMS_MISSIONS];
    const requiredTypes = new Set(allMissions.flatMap((m) => m.requirements.map((r) => r.unitType)));
    expect(requiredTypes.has('police_suv'), 'police_suv must be required by a mission').toBe(true);
    expect(requiredTypes.has('battalion_chief'), 'battalion_chief must be required by a mission').toBe(true);
  });

  it('reward follows difficulty — no mission out-earns the most expensive mission one tier above', () => {
    const allMissions = [...FIRE_MISSIONS, ...POLICE_MISSIONS, ...EMS_MISSIONS];
    const byDifficulty: Record<number, number> = {};
    for (const m of allMissions) {
      byDifficulty[m.difficulty] = Math.max(byDifficulty[m.difficulty] ?? 0, m.baseCredits);
    }
    const topDifficulty = Math.max(...Object.keys(byDifficulty).map(Number));
    for (const d of Object.keys(byDifficulty).map(Number)) {
      if (d >= topDifficulty) continue;
      const maxHere = byDifficulty[d];
      // ?? Infinity: if a future rebalance leaves a difficulty tier empty, the
      // comparison must not spuriously fail on undefined.
      const maxAbove = byDifficulty[d + 1] ?? Infinity;
      expect(
        maxHere <= maxAbove,
        `difficulty ${d} max (${maxHere}) out-earns difficulty ${d + 1} max (${maxAbove})`
      ).toBe(true);
    }
  });

  it('wildfire fits its difficulty band after the v0.18.0 retune', () => {
    const wildfire = [...FIRE_MISSIONS, ...POLICE_MISSIONS, ...EMS_MISSIONS].find((m) => m.id === 'wildfire')!;
    const allMissions = [...FIRE_MISSIONS, ...POLICE_MISSIONS, ...EMS_MISSIONS];
    const band = rewardBandFor(wildfire.difficulty, allMissions);
    expect(REWARD_BAND_PCT).toBeGreaterThan(0);
    expect(wildfire.baseCredits).toBeGreaterThanOrEqual(band.min);
    expect(wildfire.baseCredits).toBeLessThanOrEqual(band.max);
  });

  it('garage_fire pays above room_fire (bigger incident, more units)', () => {
    const room = FIRE_MISSIONS.find((m) => m.id === 'room_fire')!;
    const garage = FIRE_MISSIONS.find((m) => m.id === 'garage_fire')!;
    expect(garage.baseCredits).toBeGreaterThan(room.baseCredits);
  });

  it('recovery templates are off-pool and never spawn organically', () => {
    // Exactly one restoration call per service.
    expect(RECOVERY_TEMPLATES).toHaveLength(3);
    const poolIds = new Set([...FIRE_MISSIONS, ...POLICE_MISSIONS, ...EMS_MISSIONS].map((m) => m.id));
    for (const t of RECOVERY_TEMPLATES) {
      expect(t.spawnWeight, `${t.id} must not appear in random spawns`).toBe(0);
      expect(poolIds.has(t.id), `${t.id} must not collide with organic missions`).toBe(false);
      expect(t.baseCredits).toBeGreaterThan(0);
      expect(t.difficulty).toBeLessThanOrEqual(3);
    }
    const validUnitTypes = new Set(Object.keys(UNIT_CONFIGS));
    for (const t of RECOVERY_TEMPLATES) {
      for (const req of t.requirements) {
        expect(validUnitTypes.has(req.unitType), `Unknown unit type: ${req.unitType} in ${t.id}`).toBe(true);
      }
    }
  });

  it('recovery payouts are reduced relative to disaster-wave missions', () => {
    const waveMax = Math.max(
      ...FIRE_MISSIONS.filter((m) => ['room_fire', 'building_collapse'].includes(m.id)).map((m) => m.baseCredits),
      ...EMS_MISSIONS.filter((m) => m.id === 'car_crash_injury').map((m) => m.baseCredits),
    );
    for (const t of RECOVERY_TEMPLATES) {
      expect(t.baseCredits).toBeLessThan(waveMax);
    }
  });

  it('spawn config has sensible values', () => {
    expect(MISSION_SPAWN_CONFIG.maxActiveMissions).toBeGreaterThan(0);
    expect(MISSION_SPAWN_CONFIG.urbanRate).toBeGreaterThan(0);
    expect(MISSION_SPAWN_CONFIG.suburbanRate).toBeGreaterThan(MISSION_SPAWN_CONFIG.urbanRate);
  });
});

describe('getMissionsForService', () => {
  it('returns fire missions for fire', () => {
    expect(getMissionsForService('fire')).toBe(FIRE_MISSIONS);
  });

  it('returns police missions for police', () => {
    expect(getMissionsForService('police')).toBe(POLICE_MISSIONS);
  });

  it('returns EMS missions for ems', () => {
    expect(getMissionsForService('ems')).toBe(EMS_MISSIONS);
  });

  it('defaults to fire for unknown service', () => {
    expect(getMissionsForService('unknown' as any)).toBe(FIRE_MISSIONS);
  });
});

describe('getMissionPriority', () => {
  it('rates difficulty 8+ as critical', () => {
    expect(getMissionPriority(8, 'fire')).toBe('critical');
    expect(getMissionPriority(10, 'police')).toBe('critical');
  });

  it('rates hazmat and rescue incidents as critical regardless of difficulty', () => {
    expect(getMissionPriority(3, 'hazmat')).toBe('critical');
    expect(getMissionPriority(4, 'rescue')).toBe('critical');
  });

  it('rates difficulty 5-7 as high', () => {
    expect(getMissionPriority(5, 'fire')).toBe('high');
    expect(getMissionPriority(7, 'ems')).toBe('high');
  });

  it('rates difficulty 3-4 as medium', () => {
    expect(getMissionPriority(3, 'police')).toBe('medium');
    expect(getMissionPriority(4, 'fire')).toBe('medium');
  });

  it('bumps short-window calls (<=60s) up to medium', () => {
    expect(getMissionPriority(1, 'traffic', 45)).toBe('medium');
    expect(getMissionPriority(2, 'traffic', 60)).toBe('medium');
  });

  it('keeps easy routine calls low', () => {
    expect(getMissionPriority(1, 'police')).toBe('low');
    expect(getMissionPriority(2, 'traffic', 120)).toBe('low');
  });

  it('ranks map low < medium < high < critical', () => {
    expect(MISSION_PRIORITY_RANK.low).toBeLessThan(MISSION_PRIORITY_RANK.medium);
    expect(MISSION_PRIORITY_RANK.medium).toBeLessThan(MISSION_PRIORITY_RANK.high);
    expect(MISSION_PRIORITY_RANK.high).toBeLessThan(MISSION_PRIORITY_RANK.critical);
  });
});

describe('getTrafficDutyTemplates', () => {
  it('never returns arbitrary non-road missions', () => {
    for (const service of ['fire', 'police', 'ems'] as const) {
      for (const t of getTrafficDutyTemplates(service)) {
        expect(
          t.category === 'traffic' || t.poiTypes.some((p) => ROAD_POI_TYPES.includes(p)),
          `${service} duty template ${t.id} is not road-related`
        ).toBe(true);
      }
    }
  });

  it('returns at least one template for every service', () => {
    for (const service of ['fire', 'police', 'ems'] as const) {
      expect(getTrafficDutyTemplates(service).length).toBeGreaterThan(0);
    }
  });

  it('police duties include the dedicated traffic stops', () => {
    const ids = getTrafficDutyTemplates('police').map((t) => t.id);
    expect(ids).toContain('traffic_stop');
    expect(ids).toContain('traffic_violation');
  });

  it('EMS duties come from road/intersection calls, never cardiac or medical', () => {
    const ids = getTrafficDutyTemplates('ems').map((t) => t.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain('cardiac_emergency');
  });

  it('maps station types to their department', () => {
    expect(stationServiceFor('fire_station')).toBe('fire');
    expect(stationServiceFor('police_station')).toBe('police');
    expect(stationServiceFor('ems_station')).toBe('ems');
  });

  it('applies the level-gated partner-station discount curve', () => {
    expect(partnerStationDiscountForLevel(1)).toBe(0);
    expect(partnerStationDiscountForLevel(4)).toBe(0);
    expect(partnerStationDiscountForLevel(5)).toBe(0.1);
    expect(partnerStationDiscountForLevel(9)).toBe(0.1);
    expect(partnerStationDiscountForLevel(10)).toBe(0.2);
    expect(partnerStationDiscountForLevel(15)).toBe(0.35);
    expect(partnerStationDiscountForLevel(20)).toBe(0.5);
    expect(partnerStationDiscountForLevel(25)).toBe(0.5); // capped
  });

  it('quotes a 150 mph speed cap above any achievable in-game speed', () => {
    // Raw config speeds are ~11–18 m/s (25–40 mph); movement scales with the
    // game-speed setting and travel tech (up to ~3.3×), so the cap must sit
    // above the worst case (≈132 mph).
    expect(MAX_UNIT_SPEED_MPH).toBe(150);
    const worstCase = Math.max(...Object.values(UNIT_CONFIGS).map((c) => c.speed)) * 2.23694 * 2 * 1.63;
    expect(worstCase).toBeLessThan(MAX_UNIT_SPEED_MPH);
  });
});

describe('Premium & coin economy (v0.31.0)', () => {
  it('premium multipliers fall back to 1 for non-members', () => {
    expect(premiumCreditMultiplier(false)).toBe(1);
    expect(premiumTrainingMultiplier(false)).toBe(1);
  });

  it('premium multipliers are ×2 for members', () => {
    expect(premiumCreditMultiplier(true)).toBe(2);
    expect(premiumTrainingMultiplier(true)).toBe(2);
  });

  it('skip-training cost is 1 coin per 10s, min 1', () => {
    expect(COIN_SKIP_TRAINING_SECONDS_PER_COIN).toBe(10);
    expect(skipTrainingCost(0)).toBe(1);
    expect(skipTrainingCost(1)).toBe(1);
    expect(skipTrainingCost(20)).toBe(2);
    expect(skipTrainingCost(21)).toBe(3);
    expect(skipTrainingCost(120)).toBe(12);
  });

  it('credits conversion is 100 coins → 3500 credits', () => {
    expect(COIN_CREDITS_RATE).toEqual({ coins: 100, credits: 3500 });
    expect(creditsForCoins(100)).toBe(3500);
    expect(creditsForCoins(50)).toBe(1750);
    expect(creditsForCoins(0)).toBe(0);
  });
});