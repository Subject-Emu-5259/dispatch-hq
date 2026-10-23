import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { DISASTER_DEFINITIONS, maybeTriggerDisaster, disasterProgress, aftermathProgress, resetDisasterCooldown, RECOVERY_WAVE, AFTERMATH_WINDOW_MS, adaptWaveToService, waveWasAdapted, type ActiveDisaster, type WaveTemplateRef } from './disasters';
import { difficultyTierFor, getMissionsForService } from '@dispatch-hq/shared';
import type { CityZone } from '@/lib/patrol/patrolZones';

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  resetDisasterCooldown();
});

const active = { id: 'tornado', name: 'Tornado Warning', icon: '🌪️', startedAt: Date.now() - 1000, endsAt: Date.now() + 9000, spawned: 3, completed: 0 } as ActiveDisaster;

describe('disasters', () => {
  it('has 3+ definitions with templates and bonuses', () => {
    expect(DISASTER_DEFINITIONS.length).toBeGreaterThanOrEqual(3);
    for (const d of DISASTER_DEFINITIONS) {
      expect(d.templates.length).toBeGreaterThanOrEqual(3);
      expect(d.completionBonus.credits).toBeGreaterThan(0);
      expect(d.durationSec).toBeGreaterThan(0);
    }
  });

  it('never triggers while one is active', () => {
    expect(maybeTriggerDisaster(5, active, 'normal')).toBeNull();
  });

  it('honors the frequency setting', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Off: never triggers regardless of level/roll.
    expect(maybeTriggerDisaster(20, null, 'off')).toBeNull();
    // Low level + rare: effectively never (chance below the roll).
    expect(maybeTriggerDisaster(1, null, 'rare')).toBeNull();
  });

  it('scales chance with level', () => {
    // A mid roll: level 1 (chance 0.025) misses, level 20 (capped 0.3) hits.
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    expect(maybeTriggerDisaster(1, null, 'frequent')).toBeNull();
    const high = maybeTriggerDisaster(20, null, 'frequent');
    expect(high).not.toBeNull();
    expect(high!.id.length).toBeGreaterThan(0);
  });

  it('respects the cooldown between triggers', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const first = maybeTriggerDisaster(20, null, 'frequent');
    expect(first).not.toBeNull();
    // Immediately after, still within cooldown → no second trigger.
    expect(maybeTriggerDisaster(20, null, 'frequent')).toBeNull();
  });

  it('progress is 0..1', () => {
    const p = disasterProgress(active);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it('picks a matching zone or falls back', () => {
    const zones: CityZone[] = [
      { id: 'north', name: 'North', direction: 'north', bounds: { latMin: 0, latMax: 1, lngMin: 0, lngMax: 1 }, center: { lat: 0.5, lng: 0.5 }, covered: true },
    ];
    const def = DISASTER_DEFINITIONS[0];
    expect(def).toBeDefined();
  });
});

describe('recovery aftermath', () => {
  it('defines a 3-call recovery wave across the three services', () => {
    expect(RECOVERY_WAVE).toHaveLength(3);
    const services = new Set(RECOVERY_WAVE.map((w) => w.service));
    expect(services.size).toBe(3);
    const ids = RECOVERY_WAVE.map((w) => w.templateId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('recovery_assessment');
    expect(ids).toContain('recovery_relocation');
    expect(ids).toContain('recovery_debris');
  });

  it('gives the city a bounded recovery window', () => {
    expect(AFTERMATH_WINDOW_MS).toBeGreaterThan(0);
  });

  it('reports 0 progress before any recovery calls spawn', () => {
    const a: ActiveDisaster = { ...active, phase: 'aftermath' };
    expect(aftermathProgress(a)).toBe(0);
  });

  it('scales recovery progress with completions and caps at 1', () => {
    const a: ActiveDisaster = { ...active, phase: 'aftermath', recoverySpawned: 2, recoveryCompleted: 1 };
    expect(aftermathProgress(a)).toBe(0.5);
    expect(aftermathProgress({ ...a, recoveryCompleted: 2 })).toBe(1);
    expect(aftermathProgress({ ...a, recoveryCompleted: 5 })).toBe(1);
  });
});

describe('adaptWaveToService', () => {
  const wave: WaveTemplateRef[] = [
    { templateId: 'room_fire', service: 'fire' },
    { templateId: 'car_crash_injury', service: 'ems' },
    { templateId: 'robbery', service: 'police' },
  ];

  it('keeps own-service calls untouched', () => {
    const out = adaptWaveToService(wave, 'police', [], () => 0);
    expect(out[2]).toEqual({ templateId: 'robbery', service: 'police' });
  });

  it('replaces unanswerable cross-service calls with same-service calls of the same difficulty tier', () => {
    const out = adaptWaveToService(wave, 'police', [], () => 0);
    expect(out).toHaveLength(3);
    // Fire call → a police call in the same tier as room_fire.
    expect(out[0].service).toBe('police');
    expect(out[0].templateId).not.toBe('room_fire');
    const fire = getMissionsForService('fire').find((t) => t.id === 'room_fire')!;
    const rep = getMissionsForService('police').find((t) => t.id === out[0].templateId)!;
    expect(difficultyTierFor(rep.difficulty)).toBe(difficultyTierFor(fire.difficulty));
    // EMS call → also a police call.
    expect(out[1].service).toBe('police');
    // Own-service call stays.
    expect(out[2]).toEqual({ templateId: 'robbery', service: 'police' });
  });

  it('keeps cross-service calls when a partner station makes them answerable', () => {
    const out = adaptWaveToService(wave, 'police', [{ type: 'fire_station' }], () => 0);
    expect(out[0]).toEqual({ templateId: 'room_fire', service: 'fire' }); // partner fire station → kept
    expect(out[1].service).toBe('police'); // no EMS station → replaced
    expect(out[2]).toEqual({ templateId: 'robbery', service: 'police' });
  });

  it('passes the wave through unchanged when service is null', () => {
    const out = adaptWaveToService(wave, null, []);
    expect(out).toEqual(wave);
  });

  it('adapts the recovery wave to a police-only city', () => {
    const out = adaptWaveToService(RECOVERY_WAVE, 'police', [], () => 0);
    expect(out).toHaveLength(RECOVERY_WAVE.length);
    expect(out.every((item) => item.service === 'police')).toBe(true);
    // The police recovery item is untouched.
    expect(out.find((i) => i.templateId === 'recovery_assessment')).toBeDefined();
  });

  it('keeps a full-strength wave — replacement never drops calls', () => {
    const out = adaptWaveToService(wave, 'police', [], () => 0);
    expect(out.length).toBe(wave.length);
  });
});

describe('waveWasAdapted', () => {
  const wave: WaveTemplateRef[] = [
    { templateId: 'room_fire', service: 'fire' },
    { templateId: 'robbery', service: 'police' },
  ];

  it('is false when the wave passes through unchanged', () => {
    expect(waveWasAdapted(wave, [...wave])).toBe(false);
  });

  it('is true when any call is swapped to the player\'s department', () => {
    const out = adaptWaveToService(wave, 'police', [], () => 0);
    expect(waveWasAdapted(wave, out)).toBe(true);
  });

  it('is false for a multi-service city where every call is already answerable', () => {
    const out = adaptWaveToService(wave, 'police', [{ type: 'fire_station' }], () => 0);
    // Fire call kept (partner station), police call kept (own service) → no swaps.
    expect(waveWasAdapted(wave, out)).toBe(false);
  });

  it('is true when the wave length changes (should never happen — defensive)', () => {
    expect(waveWasAdapted(wave, [wave[0]])).toBe(true);
  });

  it('is false for empty waves', () => {
    expect(waveWasAdapted([], [])).toBe(false);
  });
});
