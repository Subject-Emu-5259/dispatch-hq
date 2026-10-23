// ============================================
// Dispatch HQ — County Jail Capacity (v0.24.0)
// ============================================
// The county jail used to accept every booking silently (no cap). This gives
// it a real gate so the police "Jail Capacity" specialization perk is
// mechanical, not cosmetic: the jail holds a base number of inmates, the perk
// raises that cap per station, and a full jail transfers the next booking out
// (mirroring the hospital ER's at-capacity diversion).

import type { CriminalRecord, Inmate, Station } from '@dispatch-hq/shared';
import { capacityBonusFor } from '@dispatch-hq/shared';
import { buildInmateFromRecord } from '@/lib/justice';

/** Base booking slots at the county jail before any perk. */
export const BASE_JAIL_CAPACITY = 12;

/** Booking slots after the "Jail Capacity" perk across police stations. */
export function jailCapacity(stations: Pick<Station, 'perks'>[]): number {
  return BASE_JAIL_CAPACITY + capacityBonusFor(stations, 'jail_capacity');
}

/** Inmates currently occupying the jail (released inmates don't count). */
export function jailOccupancy(inmates: Pick<Inmate, 'status'>[]): number {
  return inmates.filter((i) => i.status !== 'released').length;
}

export interface BookingResult {
  inmate: Inmate;
  /** True when the jail was full and the subject was transferred out instead. */
  transferred: boolean;
}

/**
 * Book a subject into the county jail, or transfer them out when the jail is
 * at (or over) capacity. Pure — the caller persists `inmate` and branches the
 * radio line on `transferred`. Transferred inmates keep the existing
 * `status: 'transferred'` badge in the roster.
 */
export function bookInmate(
  record: CriminalRecord,
  city: string,
  stations: Pick<Station, 'perks'>[],
  inmates: Pick<Inmate, 'status'>[],
): BookingResult {
  const full = jailOccupancy(inmates) >= jailCapacity(stations);
  const inmate = buildInmateFromRecord(record, city);
  if (full) return { inmate: { ...inmate, status: 'transferred' }, transferred: true };
  return { inmate, transferred: false };
}
