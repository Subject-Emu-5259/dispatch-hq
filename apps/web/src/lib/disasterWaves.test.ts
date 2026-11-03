import { describe, it, expect } from 'vitest';
import {
  WAVE_STAGE_COUNTS, WAVE_STAGE_MULTS, waveRewardMultForStage, planDisasterWave,
  startDisasterWave, currentWaveStage, recordWaveSpawned, recordWaveCompletion, waveTotalMissions,
} from './disasterWaves';

describe('disasterWaves (Batch 3b)', () => {
  it('plans 3 escalating stages rotating districts', () => {
    const plan = planDisasterWave(['Downtown', 'Northside']);
    expect(plan.map((p) => [p.stage, p.district, p.missionCount, p.rewardMult])).toEqual([
      [1, 'Downtown', 2, 1],
      [2, 'Northside', 3, 1.3],
      [3, 'Downtown', 4, 1.6],
    ]);
    expect(WAVE_STAGE_COUNTS).toEqual([2, 3, 4]);
    expect(WAVE_STAGE_MULTS).toEqual([1, 1.3, 1.6]);
    expect(planDisasterWave([])[0].district).toBe('Citywide');
  });

  it('escalates reward math per stage', () => {
    expect(waveRewardMultForStage(1)).toBe(1);
    expect(waveRewardMultForStage(2)).toBe(1.3);
    expect(waveRewardMultForStage(3)).toBe(1.6);
    expect(waveRewardMultForStage(undefined)).toBe(1);
    expect(waveRewardMultForStage(9)).toBe(1);
    expect(Math.round(500 * waveRewardMultForStage(3))).toBe(800);
  });

  it('advances stage-by-stage and completes on the finale', () => {
    let w = startDisasterWave('wildfire', ['Downtown', 'Northside']);
    expect(waveTotalMissions(w)).toBe(9);
    expect(currentWaveStage(w)?.stage).toBe(1);
    w = recordWaveSpawned(w, 1, 2);
    let r = recordWaveCompletion(w, 1);
    expect(r.advanced).toBe(false);
    w = r.wave;
    r = recordWaveCompletion(w, 1);
    expect(r.advanced).toBe(true);
    expect(r.completed).toBe(false);
    expect(currentWaveStage(r.wave)?.stage).toBe(2);
    // Stale stage-1 completion after advancing: counted, never re-advances.
    const stale = recordWaveCompletion(r.wave, 1);
    expect(stale.advanced).toBe(false);
    expect(stale.completed).toBe(false);
    // Run stage 2 (3 spawns) then stage 3 (4 spawns) to completion.
    let cur = recordWaveSpawned(stale.wave, 2, 3);
    for (let i = 0; i < 3; i++) cur = recordWaveCompletion(cur, 2).wave;
    expect(currentWaveStage(cur)?.stage).toBe(3);
    cur = recordWaveSpawned(cur, 3, 4);
    let last = recordWaveCompletion(cur, 3);
    for (let i = 0; i < 3; i++) last = recordWaveCompletion(last.wave, 3);
    expect(last.completed).toBe(true);
    expect(last.wave.status).toBe('complete');
    expect(currentWaveStage(last.wave)).toBeNull();
  });
});
