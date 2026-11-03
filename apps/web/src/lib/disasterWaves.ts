// ============================================
// Dispatch HQ — Multi-Stage Disaster Waves (Batch 3b)
// ============================================
// Feature 6: the existing disaster system (lib/disasters) spawns ONE flat
// wave of calls. A wave director turns it into a multi-stage event: each
// stage plays in a different district, spawns more calls than the last,
// and pays escalating rewards — clear stage 1 and stage 2 hits harder,
// clear that and the finale lands. Pure state machine: the App owns
// spawning (buildMission) and completion counting; this module owns the
// plan, the escalation math, and the advance/complete transitions.
//
// A wave stage's missions are ordinary disaster missions carrying
// `district` + `waveStage` fields (see Mission), so the existing disaster
// completion counters and the rewards stack keep working — the stage
// multiplier rides in through rewards.ts `waveRewardMult`.

export interface WaveStagePlan {
  /** 1-based stage number. */
  stage: number;
  /** District this stage hits (rotates through the city's unlocked districts). */
  district: string;
  /** Missions this stage spawns. */
  missionCount: number;
  /** Reward multiplier for this stage's missions (escalating). */
  rewardMult: number;
}

/** Stage sizes grow: 2 calls, then 3, then 4. */
export const WAVE_STAGE_COUNTS = [2, 3, 4];
/** Stage rewards escalate: 1×, then 1.3×, then 1.6×. */
export const WAVE_STAGE_MULTS = [1, 1.3, 1.6];
export const WAVE_STAGE_COUNT = WAVE_STAGE_COUNTS.length;

/** Reward multiplier for a 1-based wave stage (unknown stages pay base). */
export function waveRewardMultForStage(stage: number | null | undefined): number {
  if (stage == null || stage < 1 || stage > WAVE_STAGE_MULTS.length) return 1;
  return WAVE_STAGE_MULTS[stage - 1];
}

/**
 * Plan a wave's stages across `districts` (unlocked districts, roster
 * order). Stages rotate districts so the disaster visibly moves across
 * the city instead of hammering one neighborhood; with no districts the
 * plan falls back to a single 'Citywide' district.
 */
export function planDisasterWave(districts: readonly string[]): WaveStagePlan[] {
  const pool = districts.length > 0 ? [...districts] : ['Citywide'];
  return WAVE_STAGE_COUNTS.map((missionCount, i) => ({
    stage: i + 1,
    district: pool[i % pool.length],
    missionCount,
    rewardMult: WAVE_STAGE_MULTS[i],
  }));
}

export interface WaveStageState extends WaveStagePlan {
  spawned: number;
  completed: number;
}

export interface DisasterWaveState {
  /** Disaster definition id (tornado / flood / wildfire) — matches mission.disasterId. */
  defId: string;
  stages: WaveStageState[];
  /** 0-based index of the stage currently playing. */
  currentStage: number;
  status: 'active' | 'complete';
}

/** Start a wave for `defId` across `districts`. */
export function startDisasterWave(defId: string, districts: readonly string[]): DisasterWaveState {
  return {
    defId,
    stages: planDisasterWave(districts).map((p) => ({ ...p, spawned: 0, completed: 0 })),
    currentStage: 0,
    status: 'active',
  };
}

/** The stage currently playing, or null when the wave is complete. */
export function currentWaveStage(wave: DisasterWaveState | null): WaveStageState | null {
  if (!wave || wave.status !== 'active') return null;
  return wave.stages[wave.currentStage] ?? null;
}

/** Record how many missions a stage actually spawned (spawn can skip on road-snap failure). */
export function recordWaveSpawned(wave: DisasterWaveState, stage: number, spawned: number): DisasterWaveState {
  const stages = wave.stages.map((s) => (s.stage === stage ? { ...s, spawned } : s));
  return { ...wave, stages };
}

export interface WaveAdvance {
  wave: DisasterWaveState;
  /** True when the completed stage closed and a new stage is now playing. */
  advanced: boolean;
  /** True when the final stage closed — the wave is over. */
  completed: boolean;
}

/**
 * Record one completed mission of `stage` (1-based). When a stage's
 * completions reach its spawns, the wave advances — or completes on the
 * final stage. Completions beyond a stage's spawns (stale missions from
 * an earlier wave) are counted but never advance a stage twice: advance
 * fires only on the transition into completed >= spawned.
 */
export function recordWaveCompletion(wave: DisasterWaveState, stage: number): WaveAdvance {
  if (wave.status !== 'active') return { wave, advanced: false, completed: false };
  const target = wave.stages.find((s) => s.stage === stage);
  if (!target || target.stage !== wave.stages[wave.currentStage]?.stage) {
    // Not the live stage: count it (bookkeeping) without advancing.
    const stages = wave.stages.map((s) => (s.stage === stage ? { ...s, completed: s.completed + 1 } : s));
    return { wave: { ...wave, stages }, advanced: false, completed: false };
  }
  const stages = wave.stages.map((s) => (s.stage === stage ? { ...s, completed: s.completed + 1 } : s));
  const updated = stages.find((s) => s.stage === stage)!;
  if (updated.spawned <= 0 || updated.completed < updated.spawned) {
    return { wave: { ...wave, stages }, advanced: false, completed: false };
  }
  if (wave.currentStage + 1 >= wave.stages.length) {
    return { wave: { ...wave, stages, status: 'complete' }, advanced: false, completed: true };
  }
  return { wave: { ...wave, stages, currentStage: wave.currentStage + 1 }, advanced: true, completed: false };
}

/** Total missions a full wave spawns (2 + 3 + 4 = 9). */
export function waveTotalMissions(wave: DisasterWaveState): number {
  return wave.stages.reduce((sum, s) => sum + s.missionCount, 0);
}
