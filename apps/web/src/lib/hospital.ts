// ============================================
// Dispatch HQ — City Hospital
// ============================================
// The physical ER that EMS units transport victims to. The hospital is
// PLAYER-PLACED (v0.22.12): the commander builds "City General Hospital" by
// clicking the map, and the ER lives wherever they put it. The placed hospital
// is persisted in the save (gameStore.hospital). Until it is built, EMS calls
// complete at the scene — there is no ER to transport to.
//
// The air-ambulance helipad is a SEPARATE player-placed structure (v0.22.12):
// the commander builds "Air Ambulance Helipad" wherever they choose, and
// critical patients only airlift when a helipad actually exists.

import type { GeoPoint, Mission, Patient, Station } from '@dispatch-hq/shared';
import { capacityBonusFor } from '@dispatch-hq/shared';
import { loadSettings } from '@/utils/settings';

export interface Hospital {
  id: string;
  name: string;
  /** Where the ER is — units drive here to deliver patients. */
  position: GeoPoint;
  /** Static capacity (beds). Occupancy is derived from admitted patients. */
  beds: number;
  /**
   * Ward expansion level (v0.22.16) — credits-bought base beds. Absent on old
   * saves (level 0, the base 40-bed ward). Each level adds WARD_BEDS_PER_LEVEL.
   */
  wardLevel?: number;
  /**
   * Last nurse rotation (v0.22.17) — epoch ms. ER fatigue accrues from the
   * later of the shift start and this stamp, so a paid rotation resets the
   * fatigue clock mid-shift and brings the earned staff back. Absent on old
   * saves (fatigue behaves exactly as before: from the shift start).
   */
  lastRotationAt?: number;
}

export interface Helipad {
  id: string;
  name: string;
  /** Where the air-ambulance landing zone is (v0.22.12 — player-placed). */
  position: GeoPoint;
}

/** How long a road transport may take before the ER admits remotely. */
export const TRANSPORT_TIMEOUT_MS = 120_000;

/** Shorter cap for airlifted (critical) transports — the helicopter is faster.
 * Sized for the two-leg flight (scene → pad → hospital ER, v0.22.x): ~8 km at
 * air speed needs about 2.5 minutes, and `startedAt` resets when the helo
 * leaves the pad, so each leg gets a full window. */
export const AIR_TRANSPORT_TIMEOUT_MS = 150_000;

/** Cruise speed for the air-ambulance flight leg (~200 km/h — ~4× road default). */
export const AIR_SPEED_MS = 55;

/** Base ER bed capacity per city. */
export const HOSPITAL_BEDS = 40;

// ── Ward expansion (v0.22.16) ────────────────────────────────────────────────
// Overflow is a choice: besides staffing up the ER by clearing EMS calls, the
// commander can spend credits to expand the base ward directly — +10 beds per
// level, 5 levels, escalating costs. Upgraded beds stack with the staffing
// bonus (effective = base + ward + nurses).

/** Beds each ward upgrade adds to the base ER. */
export const WARD_BEDS_PER_LEVEL = 10;

/** Max credits-bought ward levels (5 × 10 = +50 beds on top of the base 40). */
export const HOSPITAL_WARD_MAX_LEVEL = 5;

/** Cost of each ward upgrade level, index = the level being bought (1-based). */
export const WARD_UPGRADE_COSTS = [5000, 9000, 15000, 24000, 36000];

/** The hospital's current ward level (old saves default to 0). */
export function wardLevel(hospital: { wardLevel?: number } | null | undefined): number {
  return Math.min(HOSPITAL_WARD_MAX_LEVEL, Math.max(0, hospital?.wardLevel ?? 0));
}

/** Cost of the NEXT ward upgrade, or null when the ward is fully expanded. */
export function wardUpgradeCost(
  hospital: { wardLevel?: number } | null | undefined,
): number | null {
  const level = wardLevel(hospital);
  if (level >= HOSPITAL_WARD_MAX_LEVEL) return null;
  return WARD_UPGRADE_COSTS[level];
}

/**
 * Buy the next ward expansion: +WARD_BEDS_PER_LEVEL static beds and +1 level.
 * Pure (the caller spends the credits). No-op when already maxed, and works on
 * old saves whose hospital predates wardLevel.
 */
export function applyWardUpgrade(hospital: Hospital | null | undefined): Hospital | null {
  if (!hospital) return hospital ?? null;
  if (wardLevel(hospital) >= HOSPITAL_WARD_MAX_LEVEL) return hospital;
  return {
    ...hospital,
    beds: hospital.beds + WARD_BEDS_PER_LEVEL,
    wardLevel: wardLevel(hospital) + 1,
  };
}


/** Credit cost to build the City General Hospital (v0.22.12 — player-placed). */
export const HOSPITAL_BUILD_COST = 6000;

/** Credit cost to build the Air Ambulance Helipad (v0.22.12 — player-placed). */
export const HELIPAD_BUILD_COST = 2000;

/**
 * Build the player-placed hospital at the chosen spot. The ER sits exactly at
 * `position` (the caller clamps it to the city boundary). One per city — the
 * id is city-scoped so building again in the same city replaces the old site.
 */
export function makeHospital(
  city: { name: string; bounds?: [[number, number], [number, number]] } | null | undefined,
  position: GeoPoint,
): Hospital {
  // Strip the state/country suffix geocoders append ("West Memphis, AR" →
  // "West Memphis") so the ER reads as a local landmark, not an address.
  const cityName = (city?.name ?? 'City').split(',')[0].trim();
  const slug = (city?.name ?? 'city').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return {
    id: `hospital_${slug}`,
    name: `${cityName} General Hospital`,
    position,
    beds: HOSPITAL_BEDS,
    wardLevel: 0,
  };
}

/**
 * Build the player-placed air-ambulance helipad (v0.22.12). Critical patients
 * only airlift when a helipad exists — the commander chooses the landing zone
 * independently of the ER. One per city; the id is city-scoped so rebuilding
 * replaces the old pad.
 */
export function makeHelipad(
  city: { name: string } | null | undefined,
  position: GeoPoint,
): Helipad {
  const cityName = (city?.name ?? 'City').split(',')[0].trim();
  const slug = (city?.name ?? 'city').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return {
    id: `helipad_${slug}`,
    name: `${cityName} Air Ambulance Helipad`,
    position,
  };
}

/** How many of the ER's beds are currently occupied by admitted patients. */
export function hospitalOccupancy(patients: Pick<Patient, 'status'>[]): number {
  return patients.filter((p) => p.status !== 'discharged').length;
}

// ── ER depth (v0.22.12): staffing + bed overflow ─────────────────────────────
// The ER's capacity is not a flat 40 beds — the commander's EMS shift feeds it.
// Every EMS call cleared this shift puts another nurse on the floor (capped),
// so an active EMS operation keeps the ER open longer, while a quiet shift
// leaves it running a lean skeleton crew. When every bed is taken, new
// patients are diverted to the regional trauma center in the next city over.

/** Baseline ER nurses on the floor (even with zero EMS clears this shift). */
export const BASE_ER_STAFF = 2;

/** Max extra nurses earned from EMS calls cleared this shift. */
export const MAX_ER_STAFF_BONUS = 8;

/** Beds each nurse keeps open above the base ward. */
export const BEDS_PER_NURSE = 1;

// ── ER staffing decay (v0.22.16): nurses leave on long shifts ───────────────
// Mirrors the crew-condition system (lib/personnel): ER nurses accrue fatigue
// while the shift runs and — at the same overwork threshold as crews — start
// rotating off the floor, so effective capacity sags on marathon sessions and
// recovers on a fresh shift. The Shift Pressure setting (off/gentle/full)
// gates it exactly like crew fatigue: off freezes it, gentle halves the rate.

/** 1 real second = 0.5 game minutes — the game clock (see the App.tsx tick). */
export const GAME_MIN_PER_REAL_SEC = 0.5;

/** ER fatigue per game-minute of shift — the same rate as an assigned crew. */
export const STAFF_FATIGUE_PER_GAME_MIN = 0.05;

/** ER overwork threshold — above it, earned bonus nurses start rotating off. */
export const STAFF_OVERWORK_THRESHOLD = 70;

/**
 * The point the fatigue clock counts from: the later of the shift start and
 * the last nurse rotation (v0.22.17). A rotation mid-shift restarts the
 * clock; a rotation from a previous shift is older than the new shift start
 * and is ignored. Null without a shift clock.
 */
function fatigueAnchor(
  shift: { startedAt?: number } | null | undefined,
  hospital?: { lastRotationAt?: number } | null,
): number | null {
  if (typeof shift?.startedAt !== 'number') return null;
  const rotation = typeof hospital?.lastRotationAt === 'number' ? hospital.lastRotationAt : null;
  if (rotation === null) return shift.startedAt;
  return Math.max(shift.startedAt, rotation);
}

/**
 * ER fatigue 0–100 for the current shift. 0 with no shift clock, and the
 * Shift Pressure setting freezes it in 'off' and halves the rate in 'gentle'.
 * A paid nurse rotation (hospital.lastRotationAt) resets the clock mid-shift.
 */
export function erStaffFatigue(
  shift: { startedAt?: number } | null | undefined,
  now = Date.now(),
  hospital?: { lastRotationAt?: number } | null,
): number {
  const mode = loadSettings().fatigueMode ?? 'full';
  const anchor = fatigueAnchor(shift, hospital);
  if (mode === 'off' || anchor === null) return 0;
  const gameSpeed = loadSettings().gameSpeed ?? 1;
  const elapsedGameMin = (Math.max(0, now - anchor) / 1000) * GAME_MIN_PER_REAL_SEC * gameSpeed;
  const rate = mode === 'gentle' ? 0.5 : 1;
  return Math.min(100, Math.round(elapsedGameMin * STAFF_FATIGUE_PER_GAME_MIN * rate));
}

/**
 * Share of earned bonus nurses off the floor: 0 below the overwork threshold,
 * ramping linearly to 1 at exhaustion (the base skeleton crew never leaves).
 */
export function staffDecayFraction(
  shift: { startedAt?: number } | null | undefined,
  now = Date.now(),
  hospital?: { lastRotationAt?: number } | null,
): number {
  const fatigue = erStaffFatigue(shift, now, hospital);
  if (fatigue < STAFF_OVERWORK_THRESHOLD) return 0;
  return Math.min(1, (fatigue - STAFF_OVERWORK_THRESHOLD) / (100 - STAFF_OVERWORK_THRESHOLD));
}

/**
 * ER staffing this shift: base crew + one nurse per EMS call cleared
 * (capped), minus any nurses rotated off by shift fatigue. Runs 2–10 on a
 * fresh shift; sags toward the 2-nurse skeleton as a long shift wears on.
 */
export function erStaffing(
  shift: { emsCleared?: number; startedAt?: number } | null | undefined,
  now = Date.now(),
  hospital?: { lastRotationAt?: number } | null,
): number {
  const cleared = Math.max(0, shift?.emsCleared ?? 0);
  const bonus = Math.min(MAX_ER_STAFF_BONUS, cleared);
  const leaving = Math.round(bonus * staffDecayFraction(shift, now, hospital));
  return BASE_ER_STAFF + bonus - leaving;
}

/**
 * Effective bed count: the base ward plus the staffing bonus (post-decay),
 * plus the EMS "Hospital Ward" perk (v0.24.0) across EMS stations.
 */
export function hospitalBedBonus(stations: Pick<Station, 'perks'>[]): number {
  return capacityBonusFor(stations, 'hospital_beds');
}

export function effectiveBeds(
  hospital: Pick<Hospital, 'beds' | 'lastRotationAt'> | null | undefined,
  shift: { emsCleared?: number; startedAt?: number } | null | undefined,
  now = Date.now(),
  stations: Pick<Station, 'perks'>[] = [],
): number {
  return (hospital?.beds ?? 0) + erStaffing(shift, now, hospital) + hospitalBedBonus(stations);
}

/** True when the ER has no free beds left — the next patient must divert. */
export function atCapacity(
  patients: Pick<Patient, 'status'>[],
  hospital: Pick<Hospital, 'beds' | 'lastRotationAt'> | null | undefined,
  shift: { emsCleared?: number; startedAt?: number } | null | undefined,
  now = Date.now(),
  stations: Pick<Station, 'perks'>[] = [],
): boolean {
  return hospitalOccupancy(patients) >= effectiveBeds(hospital, shift, now, stations);
}

// ── Nurse rotation (v0.22.17) ────────────────────────────────────────────────
// The active counter to marathon shifts: pay for a fresh nursing shift and
// the ER fatigue clock resets mid-shift, which brings every earned nurse
// (and the beds they keep open) straight back to the floor. Cost is flat —
// cheap enough to be a real lever, pricey enough not to be spammed.

/** Credits to buy a nurse rotation (fresh shift on the ER floor). */
export const NURSE_ROTATION_COST = 2000;

/**
 * Pay for a nurse rotation: stamp the hospital so fatigue restarts from now.
 * Pure — the caller spends the credits. No-op on a missing hospital; works on
 * old saves (adds the stamp to whatever fields they already carry).
 */
export function applyNurseRotation(
  hospital: Hospital | null | undefined,
  now = Date.now(),
): Hospital | null {
  if (!hospital) return hospital ?? null;
  return { ...hospital, lastRotationAt: now };
}

/**
 * The regional trauma center that absorbs overflow — the "next city over" for
 * each launch city (real regional referral patterns), with a generic fallback
 * for player-searched cities.
 */
const REGIONAL_TRAUMA_CENTERS: Record<string, string> = {
  'west memphis': 'Memphis Regional Trauma Center',
  'memphis': 'Memphis Regional Trauma Center',
  'nashville': 'Nashville Regional Trauma Center',
  'little rock': 'UAMS Medical Center',
  'new york': 'Bellevue Hospital Center',
  'new york city': 'Bellevue Hospital Center',
  'los angeles': 'LAC+USC Medical Center',
  'chicago': 'Stroger Hospital of Cook County',
  'houston': 'Ben Taub Hospital',
  'london': 'Royal London Hospital',
  'paris': 'Hôpital de la Pitié-Salpêtrière',
  'berlin': 'Charité – Universitätsmedizin Berlin',
  'toronto': "St. Michael's Hospital",
  'sydney': 'Royal Prince Alfred Hospital',
  'tokyo': 'Tokyo Women\'s Medical University Hospital',
};

export function traumaCenterFor(cityName: string | null | undefined): string {
  if (!cityName) return 'Regional Trauma Center';
  const key = cityName.toLowerCase().split(',')[0].trim();
  return REGIONAL_TRAUMA_CENTERS[key] ?? 'Regional Trauma Center';
}

// ── Per-visit outcome tracking ───────────────────────────────────────────────
// Every hospital visit follows a timeline: transported (admitted) → treated →
// discharged (recovered) or released early. `patientOutcomesForShift` folds
// those milestones into shift-scoped counts for the Shift Report debrief, using
// the shift's start time so a patient admitted last shift but discharged this
// one still counts as a recovery THIS shift.

export interface PatientShiftOutcomes {
  /** Patients admitted (delivered to the ER) since the shift started. */
  transported: number;
  /** Patients whose treatment completed since the shift started. */
  treated: number;
  /** Patients discharged after treatment — the recovered count. */
  recovered: number;
  /** Patients discharged before treatment completed — released against advice. */
  released: number;
  /** Patients diverted to the regional trauma center (ER at capacity). */
  diverted: number;
  /** Transported patients who flew via the helipad this shift (v0.22.14). */
  airlifted: number;
  /** Transported patients who arrived by ambulance this shift (v0.22.14). */
  roadTransported: number;
  /** recovered / (recovered + released) for discharges this shift; null when none. */
  recoveryRate: number | null;
}

/** Aggregate patient milestones that occurred at or after the shift start. */
/**
 * Airborne-transport predicate (v0.22.x): is this mission an ACTIVE air
 * transport? True for BOTH legs of the air-ambulance flight — scene → helipad
 * (padReached false) and helipad → hospital ER (padReached true). The pad
 * flip keeps mode 'air', so the amber flight line, helicopter marker, and
 * air-strike ETA chip render for the whole scene → pad → ER path, not just
 * the first leg.
 */
export function isAirborneTransport(
  m: Pick<Mission, 'patientTransport'> | null | undefined,
): boolean {
  return !!m && m.patientTransport?.mode === 'air';
}

export function patientOutcomesForShift(
  patients: Pick<Patient, 'status' | 'admitTime' | 'treatedAt' | 'dischargedAt' | 'diverted' | 'transportMode'>[],
  startedAt: number,
): PatientShiftOutcomes {
  // Milestone fields are optional — a missing timestamp must never satisfy
  // `>= startedAt` (e.g. a shift that began at epoch 0 would otherwise count
  // every untreated patient as treated). Guard each explicitly.
  const transported = patients.filter((p) => p.admitTime >= startedAt).length;
  const treated = patients.filter((p) => p.treatedAt !== undefined && p.treatedAt >= startedAt).length;
  const discharged = patients.filter((p) => p.dischargedAt !== undefined && p.dischargedAt >= startedAt);
  const recovered = discharged.filter((p) => p.status === 'discharged' && !!p.treatedAt).length;
  const released = discharged.length - recovered;
  const diverted = patients.filter((p) => p.diverted === true && p.admitTime >= startedAt).length;
  // Airlift tally (v0.22.14): split this shift's transports by how they
  // arrived — 'air' = helicopter via the helipad, 'road' = ambulance run.
  // Scene-admitted patients (no transportMode) count in neither bucket.
  const transportedThisShift = patients.filter((p) => p.admitTime >= startedAt && p.transportMode !== undefined);
  const airlifted = transportedThisShift.filter((p) => p.transportMode === 'air').length;
  const roadTransported = transportedThisShift.filter((p) => p.transportMode === 'road').length;
  return {
    transported,
    treated,
    recovered,
    released,
    diverted,
    airlifted,
    roadTransported,
    recoveryRate: discharged.length > 0 ? recovered / discharged.length : null,
  };
}
