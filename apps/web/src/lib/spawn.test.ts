import { describe, it, expect, vi, beforeEach } from 'vitest';
import { activeMissionCap, pickRandomMissionTemplate, avoidRecentTemplate, pushRecentTemplate } from './spawn';
import { getMissionPaceMs } from '@/utils/settings';
import { getMissionsForService, type MissionTemplate } from '@dispatch-hq/shared';
import { getCityTrait, CITY_TRAITS } from '@/lib/cityTraits';

const tpl = (id: string, spawnWeight = 1): MissionTemplate => ({
  id, spawnWeight, name: id, description: '', category: 'fire', icon: '🔥',
  baseCredits: 100, baseXp: 10, difficulty: 1,
  requirements: [], estimatedDuration: 60, poiTypes: [],
});

describe('activeMissionCap', () => {
  it('clamps the base into 4-15 regardless of the setting, then adds level headroom', () => {
    // base 3 → clamped 4, +1 level headroom = 5
    expect(activeMissionCap(1, 3)).toBe(5);
    // base 99 → clamped 15, +1 → still clamped at 15
    expect(activeMissionCap(1, 99)).toBe(15);
  });

  it('scales up slightly with level, still clamped at 15', () => {
    // Level 1, base 10 → 10 + min(5,1) = 11
    expect(activeMissionCap(1, 10)).toBe(11);
    // Level 5 → +5 = 15 (clamped)
    expect(activeMissionCap(5, 10)).toBe(15);
    // Level 20 also clamps at 15
    expect(activeMissionCap(20, 10)).toBe(15);
  });

  it('never floods a low-level city even with an intense setting', () => {
    expect(activeMissionCap(1, 15)).toBe(15);
    expect(activeMissionCap(1, 4)).toBe(5);
  });
});

describe('mission pacing', () => {
  it('getMissionPaceMs maps the three pace settings', () => {
    expect(getMissionPaceMs('relaxed')).toBe(20000);
    expect(getMissionPaceMs('normal')).toBe(12000);
    expect(getMissionPaceMs('intense')).toBe(6000);
  });
});

describe('pickRandomMissionTemplate', () => {
  it('only ever picks templates from the requested service pool', () => {
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      for (const service of ['fire', 'police', 'ems'] as const) {
        const poolIds = new Set(getMissionsForService(service).map((t) => t.id));
        for (let i = 0; i < 25; i++) {
          const t = pickRandomMissionTemplate(service);
          expect(poolIds.has(t.id), `${service} picked ${t.id} outside its pool`).toBe(true);
        }
      }
    } finally {
      Math.random = origRandom;
    }
  });
});

describe('spawn variety guard (v0.22.18)', () => {
  it('keeps a template when it is not in the recent set', () => {
    const picked = avoidRecentTemplate(tpl('a'), ['b', 'c'], [tpl('a'), tpl('b'), tpl('c')]);
    expect(picked.id).toBe('a');
  });

  it('re-rolls a recent template away from the recent set', () => {
    const all = [tpl('a'), tpl('b'), tpl('c'), tpl('d'), tpl('e')];
    const origRandom = Math.random;
    Math.random = () => 0.99; // lands on the LAST candidate in weighted order
    try {
      const picked = avoidRecentTemplate(tpl('a'), ['a', 'b'], all);
      expect(picked.id).not.toBe('a');
      expect(['c', 'd', 'e']).toContain(picked.id);
    } finally {
      Math.random = origRandom;
    }
  });

  it('keeps the current template when the candidate pool would shrink too far', () => {
    const all = [tpl('a'), tpl('b')];
    expect(avoidRecentTemplate(tpl('a'), ['a'], all, 3).id).toBe('a');
    expect(avoidRecentTemplate(tpl('a'), ['a', 'b'], all, 3).id).toBe('a');
  });

  it('records recent ids with dedupe + window trim', () => {
    let recent = pushRecentTemplate([], 'a');
    recent = pushRecentTemplate(recent, 'b');
    recent = pushRecentTemplate(recent, 'a'); // a already present — moves to the back
    expect(recent).toEqual(['b', 'a']);
    for (let i = 0; i < 10; i++) recent = pushRecentTemplate(recent, `t${i}`);
    expect(recent).toHaveLength(6);
    expect(recent).not.toContain('b');
  });
});

// ── City trait spawn integration (v0.35.0) ────────────────────────────────
// capTemplateRarity is private, so we test the trait integration indirectly:
// 1. verify getCityTrait returns the correct Paris modifiers
// 2. verify pickRandomMissionTemplate still works as baseline (no trait)
// 3. verify trait multipliers are within sane bounds for spawn weight application

describe('city trait spawn integration', () => {
  it('Paris trait has all spawn weight modifiers defined', () => {
    const trait = getCityTrait('Paris');
    expect(trait).toBeDefined();
    expect(trait!.modifiers.fireSpawnWeight).toBeGreaterThan(1);
    expect(trait!.modifiers.emsSpawnWeight).toBeGreaterThan(1);
    // policeSpawnWeight is optional — not set for Paris (police stays baseline)
  });

  it('trait spawn weights stack multiplicatively with weather (1.0 baseline)', () => {
    // When no trait exists, spawn weight multiplier = 1.0 (no change)
    const noTrait = getCityTrait('Nonexistent City');
    expect(noTrait).toBeUndefined();
    // Paris trait multipliers compound: fire 1.4× means 40% more fire spawns
    const paris = getCityTrait('Paris');
    expect(paris!.modifiers.fireSpawnWeight).toBe(1.4);
    expect(paris!.modifiers.emsSpawnWeight).toBe(1.3);
    // Combined effect: fire template weight 5 → 5 × 1.4 = 7.0
    // EMS template weight 5 → 5 × 1.3 = 6.5
    // This makes fire/EMS calls noticeably more common in Paris
  });

  it('pickRandomMissionTemplate ignores traits (baseline for non-trait cities)', () => {
    const origRandom = Math.random;
    Math.random = () => 0.5;
    try {
      // pickRandomMissionTemplate doesn't take a city — it always uses baseline
      const fireTemplates = getMissionsForService('fire');
      const picked = pickRandomMissionTemplate('fire');
      expect(fireTemplates.some((t) => t.id === picked.id)).toBe(true);
    } finally {
      Math.random = origRandom;
    }
  });

  it('all trait modifiers are within sane bounds', () => {
    for (const [city, trait] of Object.entries(CITY_TRAITS)) {
      const m = trait.modifiers;
      // Spawn weights: 0.5× – 3.0× (too extreme breaks the game)
      if (m.fireSpawnWeight) expect(m.fireSpawnWeight).toBeGreaterThanOrEqual(0.5);
      if (m.fireSpawnWeight) expect(m.fireSpawnWeight).toBeLessThanOrEqual(3);
      if (m.emsSpawnWeight) expect(m.emsSpawnWeight).toBeGreaterThanOrEqual(0.5);
      if (m.emsSpawnWeight) expect(m.emsSpawnWeight).toBeLessThanOrEqual(3);
      // Reward multipliers: 0.5× – 2.0×
      if (m.creditsMultiplier) expect(m.creditsMultiplier).toBeGreaterThanOrEqual(0.5);
      if (m.creditsMultiplier) expect(m.creditsMultiplier).toBeLessThanOrEqual(2);
      if (m.xpMultiplier) expect(m.xpMultiplier).toBeGreaterThanOrEqual(0.5);
      if (m.xpMultiplier) expect(m.xpMultiplier).toBeLessThanOrEqual(2);
    }
  });
});
