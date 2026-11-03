// ===========================================
// Dispatch HQ — Units & Staff progression (Batch 3a)
// ===========================================
// Pure helpers for the four Batch 3a systems. No store imports, so the
// whole module is unit-testable and identical in both editions.
//
// 1. UNIT VETERANCY — units earn XP per cleared mission and rank up
//    Rookie -> Veteran -> Elite. Rank speeds response (ETA multiplier)
//    and, because missions expire on a clock, faster response IS higher
//    mission success; the success bonus is also reported for display.
//    This is separate from trainingLevel (the level-training system):
//    training raises what a unit is qualified for, veterancy rewards
//    what it has actually cleared.
// 2. TRAINING ACADEMY — queue a unit for one course at a time
//    (driving / hazmat / paramedic). Courses take GAME time (game
//    minutes on the virtual clock, not wall-clock seconds) and grant a
//    cert on completion. Certs unlock mission tiers: a certified unit
//    earns bonus veterancy XP on matching-tier missions and the unit
//    panel marks the tier as unlocked. Academy enrollment is FREE and
//    has NO pay-skip — it replaces pay-to-skip with play, on both
//    editions (on Reddit money mutations throw, so this matters).
//    Existing missions are never hard-gated by certs (additive rule):
//    an uncertified unit can still be dispatched, it just earns no
//    tier bonus and shows the tier as locked.
// 3. STAFF ROSTERS / FATIGUE, deepened — the existing personnel sim
//    (lib/personnel) already drives ETA through crew effectiveness.
//    Batch 3a adds the two edges that sim caps away: a rested crew
//    (low fatigue, high morale) earns a small response bonus, and a
//    crew with an exhausted member (worst fatigue >= 85) takes an
//    extra response penalty on top of the effectiveness divisor.
// 4. SHIFT SCHEDULING — per-station day / night / weekend coverage
//    toggles. A covered shift earns a response bonus, an uncovered
//    shift risks a slower response. A station with NO schedule set is
//    neutral (multiplier 1.0) so pre-3a saves are unaffected.

import type { Employee, Station, Unit } from '@dispatch-hq/shared';

// ── 1. Veterancy ─────────────────────────────────────────────────

export type VeterancyRank = 'Rookie' | 'Veteran' | 'Elite';

export const VETERAN_XP = 100;
export const ELITE_XP = 300;

export function veterancyRankFor(xp: number | undefined | null): VeterancyRank {
  const v = xp ?? 0;
  if (v >= ELITE_XP) return 'Elite';
  if (v >= VETERAN_XP) return 'Veteran';
  return 'Rookie';
}

/** XP to the next rank, or null at Elite (max rank). */
export function veterancyXpToNext(xp: number | undefined | null): number | null {
  const v = xp ?? 0;
  if (v >= ELITE_XP) return null;
  if (v >= VETERAN_XP) return ELITE_XP - v;
  return VETERAN_XP - v;
}

/**
 * Veterancy XP for one cleared mission. Difficulty is the mission's
 * 1–10 difficulty (spawn.ts scale). Certified units earn 50% more on
 * missions matching their cert's tier (see eligibleCertForMission).
 */
export function veterancyXpGain(difficulty: number, hasMatchingCert = false): number {
  const d = Math.min(10, Math.max(1, Math.round(difficulty || 1)));
  const base = 20 + 5 * d;
  return hasMatchingCert ? Math.round(base * 1.5) : base;
}

/** ETA multiplier by rank: Elite units arrive 15% faster. */
export function veterancyEtaMultiplier(rank: VeterancyRank): number {
  return rank === 'Elite' ? 0.85 : rank === 'Veteran' ? 0.92 : 1;
}

/** Reported success bonus by rank (faster response beats the expiry clock). */
export function veterancySuccessBonus(rank: VeterancyRank): number {
  return rank === 'Elite' ? 0.1 : rank === 'Veteran' ? 0.05 : 0;
}

/** Apply one mission clear to a unit. Returns the updated XP + rank + whether it ranked up. */
export function applyMissionVeterancy(
  unit: Pick<Unit, 'veterancyXp'>,
  difficulty: number,
  hasMatchingCert = false,
): { veterancyXp: number; rank: VeterancyRank; rankedUp: boolean } {
  const before = veterancyRankFor(unit.veterancyXp);
  const veterancyXp = (unit.veterancyXp ?? 0) + veterancyXpGain(difficulty, hasMatchingCert);
  const rank = veterancyRankFor(veterancyXp);
  return { veterancyXp, rank, rankedUp: rank !== before };
}

// ── 2. Training academy ──────────────────────────────────────────

export type AcademyCourseId = 'driving' | 'hazmat' | 'paramedic';

export interface AcademyCourse {
  id: AcademyCourseId;
  label: string;
  /** Game minutes the course takes on the virtual clock. */
  durationGameMin: number;
  tierLabel: string;
  blurb: string;
}

export const ACADEMY_COURSES: AcademyCourse[] = [
  { id: 'driving', label: 'Emergency Driving', durationGameMin: 120, tierLabel: 'Rapid Response', blurb: 'Pursuits and high-speed response.' },
  { id: 'hazmat', label: 'Hazmat Operations', durationGameMin: 240, tierLabel: 'Hazmat Response', blurb: 'Chemical and hazardous-material calls.' },
  { id: 'paramedic', label: 'Advanced Paramedic', durationGameMin: 360, tierLabel: 'Critical Care', blurb: 'Critical EMS calls and mass-casualty care.' },
];

export function academyCourse(id: string | undefined | null): AcademyCourse | null {
  return ACADEMY_COURSES.find((c) => c.id === id) ?? null;
}

export type AcademyEnrollment = { course: AcademyCourseId; endsAtGameMin: number };

export function unitHasCert(unit: Pick<Unit, 'certs'>, course: AcademyCourseId): boolean {
  return (unit.certs ?? []).includes(course);
}

/** Game minutes remaining on the unit's academy course, or 0 when idle. */
export function academyRemainingGameMin(
  unit: Pick<Unit, 'academy'>,
  gameMinutes: number,
): number {
  if (!unit.academy) return 0;
  return Math.max(0, Math.ceil(unit.academy.endsAtGameMin - gameMinutes));
}

/**
 * Enroll a unit in a course. Returns the updated unit fields, or null
 * when not allowed: unknown course, cert already held, a course already
 * queued, or the unit is mid level-training (wall clock) / not available.
 * Enrollment is free — there is deliberately no cost or skip path.
 */
export function enrollAcademy(
  unit: Pick<Unit, 'certs' | 'academy' | 'trainingEndsAt' | 'status'>,
  course: AcademyCourseId,
  gameMinutes: number,
  nowMs = Date.now(),
): { academy: AcademyEnrollment } | null {
  const def = academyCourse(course);
  if (!def) return null;
  if (unitHasCert(unit as Pick<Unit, 'certs'>, course)) return null;
  if (unit.academy) return null;
  if (unit.trainingEndsAt && unit.trainingEndsAt > nowMs) return null;
  if (unit.status !== 'available') return null;
  return { academy: { course, endsAtGameMin: gameMinutes + def.durationGameMin } };
}

/**
 * Complete a finished course. Returns the new certs + cleared academy,
 * or null when nothing is due yet. Pure — the caller writes the result
 * back with updateUnit and may notify on the returned course.
 */
export function completeAcademy(
  unit: Pick<Unit, 'certs' | 'academy'>,
  gameMinutes: number,
): { certs: string[]; academy: null; completedCourse: AcademyCourseId } | null {
  if (!unit.academy) return null;
  if (gameMinutes < unit.academy.endsAtGameMin) return null;
  const certs = Array.from(new Set([...(unit.certs ?? []), unit.academy.course]));
  return { certs, academy: null, completedCourse: unit.academy.course as AcademyCourseId };
}

/**
 * Which academy course (if any) a mission belongs to, by category and
 * name keywords. Null = a general call with no tier. Used for the tier
 * bonus and the tier-unlocked display — never to block a dispatch.
 */
export function eligibleCertForMission(mission: {
  name?: string;
  category?: string;
  difficulty?: number;
}): AcademyCourseId | null {
  const hay = `${mission.category ?? ''} ${mission.name ?? ''}`.toLowerCase();
  if (/(hazmat|chemical|toxic|gas leak)/.test(hay)) return 'hazmat';
  if (mission.category === 'ems' && (mission.difficulty ?? 0) >= 8) return 'paramedic';
  if (/(pursuit|chase|high-speed|high speed)/.test(hay)) return 'driving';
  return null;
}

// ── 3. Roster fatigue, deepened ──────────────────────────────────

export const EXHAUSTED_FATIGUE = 85;

/**
 * Extra response multiplier from crew condition, beyond the personnel
 * effectiveness divisor: rested crews (avg fatigue <= 20 and avg
 * morale >= 80) respond 5% faster; a crew with an exhausted member
 * responds 10% slower. Uncrewed units are unaffected (1.0).
 */
export function crewConditionMultiplier(
  employees: Pick<Employee, 'id' | 'fatigue' | 'morale'>[],
  crewIds: string[] | undefined | null,
): number {
  const ids = crewIds ?? [];
  if (ids.length === 0) return 1;
  const crew = employees.filter((e) => ids.includes(e.id));
  if (crew.length === 0) return 1;
  const avgFatigue = crew.reduce((s, e) => s + (e.fatigue ?? 0), 0) / crew.length;
  const avgMorale = crew.reduce((s, e) => s + (e.morale ?? 100), 0) / crew.length;
  const worstFatigue = Math.max(...crew.map((e) => e.fatigue ?? 0));
  if (worstFatigue >= EXHAUSTED_FATIGUE) return 1.1;
  if (avgFatigue <= 20 && avgMorale >= 80) return 0.95;
  return 1;
}

// ── 4. Shift scheduling ──────────────────────────────────────────

export type ShiftKey = 'day' | 'night' | 'weekend';
export type ShiftSchedule = { day?: boolean; night?: boolean; weekend?: boolean };

/** Game day = 720 game minutes (24h × 30 min/hour on the virtual clock). */
export const GAME_MIN_PER_DAY = 720;
export const GAME_MIN_PER_HOUR = 30;

/**
 * Current shift key for a game-minutes value. Day 0 is treated as a
 * Monday, so game days 5–6 are the weekend; night is 20:00–06:00
 * (matching NIGHT_START_HOUR / NIGHT_END_HOUR in lib/gameClock).
 * Weekend wins over day/night so one toggle covers the whole weekend.
 */
export function shiftKeyFor(gameMinutes: number): ShiftKey {
  const day = Math.floor(gameMinutes / GAME_MIN_PER_DAY);
  const hour = Math.floor(gameMinutes / GAME_MIN_PER_HOUR) % 24;
  if (day % 7 >= 5) return 'weekend';
  if (hour < 6 || hour >= 20) return 'night';
  return 'day';
}

export type ShiftCoverage = 'covered' | 'uncovered' | 'unscheduled';

/** 'unscheduled' when the station has no schedule toggles set at all. */
export function shiftCoverage(
  station: Pick<Station, 'shifts'>,
  gameMinutes: number,
): ShiftCoverage {
  const s = station.shifts;
  if (s === undefined || (s.day === undefined && s.night === undefined && s.weekend === undefined)) {
    return 'unscheduled';
  }
  return s[shiftKeyFor(gameMinutes)] === true ? 'covered' : 'uncovered';
}

/** Response multiplier: covered shifts are 7% faster, uncovered 12% slower. */
export function shiftResponseMultiplier(
  station: Pick<Station, 'shifts'>,
  gameMinutes: number,
): number {
  const c = shiftCoverage(station, gameMinutes);
  return c === 'covered' ? 0.93 : c === 'uncovered' ? 1.12 : 1;
}

/** Toggle one shift key on a station's schedule (pure — caller writes back). */
export function toggleShift(schedule: ShiftSchedule | undefined, key: ShiftKey): ShiftSchedule {
  const next = { ...(schedule ?? {}) };
  if (next[key] === true) delete next[key];
  else next[key] = true;
  return next;
}

// ── Combined response math (the dispatch wiring) ─────────────────

/**
 * Full Batch 3a ETA transform. Mirrors dispatchLogic's existing shape:
 * base ETA is multiplied by the veterancy, shift, and crew-condition
 * factors, then divided by the (floored) personnel effectiveness.
 */
export function applyUnitsStaffEta(
  etaBaseSec: number,
  opts: {
    veterancyRank: VeterancyRank;
    crewEffectiveness: number;
    shiftMultiplier: number;
    crewConditionMultiplier: number;
  },
): number {
  return Math.round(
    (etaBaseSec *
      veterancyEtaMultiplier(opts.veterancyRank) *
      opts.shiftMultiplier *
      opts.crewConditionMultiplier) /
      Math.max(0.7, opts.crewEffectiveness),
  );
}

// ── Save-load defaults (old saves predate every 3a field) ────────

export function ensureUnitStaffDefaults<T extends Pick<Unit, 'veterancyXp' | 'certs' | 'academy'>>(unit: T): T {
  return {
    ...unit,
    veterancyXp: unit.veterancyXp ?? 0,
    certs: unit.certs ?? [],
    academy: unit.academy ?? null,
  };
}

export function ensureStationStaffDefaults<T extends Pick<Station, 'shifts'>>(station: T): T {
  return station;
}
