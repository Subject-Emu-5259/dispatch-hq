// ============================================
// Dispatch HQ — Hospital + Jail Capacity Decisions (Batch 3b)
// ============================================
// Feature 11, decision layer on top of the existing capacity math:
// hospital.ts already diverts when the ER is full (effectiveBeds) and
// jailCapacity.ts already transfers when the jail is full. What was
// missing was an explicit, player-visible decision with trade-offs:
// overflow FORCES a choice, and the choice costs something.
//
// Trade-offs (no money — Reddit-safe, same in both editions):
// - Hospital diversion: the patient goes to the regional trauma center
//   instead of your ER. Cost: −3 district satisfaction (the neighborhood
//   notices ambulances leaving) and the case earns no ER staffing credit.
// - Jail transfer: the subject is booked out-of-county. Cost: the booking
//   counts at half progression credit (TRANSFER_XP_FACTOR) — the county
//   keeps the paperwork, not the win.
// Pure functions over counts; the panels own the buttons and the copy.

export type CapacityStatus = 'open' | 'tight' | 'full';

/** At/above this occupancy ratio the facility reads "tight" — one bad night from full. */
export const TIGHT_RATIO = 0.8;

/** Satisfaction cost of one hospital diversion (see cityDistricts). */
export const DIVERSION_SATISFACTION_DELTA = -3;
/** Progression credit factor for a transferred jail booking. */
export const TRANSFER_XP_FACTOR = 0.5;

export function capacityStatus(occupied: number, capacity: number): CapacityStatus {
  if (capacity <= 0) return 'full';
  if (occupied >= capacity) return 'full';
  if (occupied / capacity >= TIGHT_RATIO) return 'tight';
  return 'open';
}

/** Beds/cells still free (never negative in the display — overflow shows 0). */
export function capacityFree(occupied: number, capacity: number): number {
  return Math.max(0, capacity - occupied);
}

export interface HospitalAdmission {
  /** 'admit' — a bed is free; 'divert' — the ER is full, regional center takes the patient. */
  action: 'admit' | 'divert';
  bedsFree: number;
  status: CapacityStatus;
  /** Satisfaction delta the district takes when this decision is applied. */
  satisfactionDelta: number;
}

/** Decide one hospital admission from current occupancy vs effective beds. */
export function decideHospitalAdmission(occupied: number, beds: number): HospitalAdmission {
  const status = capacityStatus(occupied, beds);
  if (status === 'full') {
    return { action: 'divert', bedsFree: 0, status, satisfactionDelta: DIVERSION_SATISFACTION_DELTA };
  }
  return { action: 'admit', bedsFree: capacityFree(occupied, beds), status, satisfactionDelta: 0 };
}

export interface JailBookingDecision {
  /** 'book' — a cell is free; 'transfer' — the jail is full, booked out-of-county. */
  action: 'book' | 'transfer';
  cellsFree: number;
  status: CapacityStatus;
  /** Progression credit factor for this booking (1 booked, 0.5 transferred). */
  progressionFactor: number;
}

/** Decide one jail booking from current occupancy vs jail capacity. */
export function decideJailBooking(occupied: number, capacity: number): JailBookingDecision {
  const status = capacityStatus(occupied, capacity);
  if (status === 'full') {
    return { action: 'transfer', cellsFree: 0, status, progressionFactor: TRANSFER_XP_FACTOR };
  }
  return { action: 'book', cellsFree: capacityFree(occupied, capacity), status, progressionFactor: 1 };
}
