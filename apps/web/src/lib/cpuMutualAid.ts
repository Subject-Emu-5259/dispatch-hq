// ============================================
// Dispatch HQ — CPU Mutual Aid (v0.22.2)
// ============================================
// When the "City Answers Mutual Aid Calls" setting is on, partner-agency
// (cross-service) calls are resolved by simulated city units: they auto-
// dispatch after a short work window and pay a token 10% credit (no XP — the
// player didn't do the work). Pure helpers live here and are unit-tested; the
// tick in App.tsx drives the state machine.

import type { Mission } from '@dispatch-hq/shared';
import { stationServiceFor } from '@dispatch-hq/shared';
import { missionService } from './rewards';
import { getUnitServiceType } from '@/utils/routing';
import { AIRLIFT_TEMPLATE_IDS } from '@/lib/radioDialogueEngine';

/** Simulated partner-agency unit names used when the CPU answers a call. */
export const CPU_UNIT_NAME: Record<'fire' | 'police' | 'ems', string> = {
  fire: 'Engine 4',
  police: 'Unit 12',
  ems: 'Ambulance 7',
};

/**
 * How long (real seconds, already divided by game speed) a simulated city
 * unit takes to resolve a call: 30s at difficulty 1 scaling up to a 75s cap.
 */
export function cpuWorkSeconds(difficulty: number, gameSpeed = 1): number {
  return Math.min(75, Math.max(30, 20 + difficulty * 6)) / Math.max(0.1, gameSpeed);
}

/** Token payout for a CPU-handled call: 10% of the reward, minimum 50. No XP. */
export function cpuMutualAidPayout(creditsReward: number): number {
  return Math.max(50, Math.round(creditsReward * 0.1));
}

/** Is this a partner-agency (cross-service) call for the player's department? */
export function isPartnerAgencyCall(
  mission: Pick<Mission, 'category'>,
  service: 'fire' | 'police' | 'ems' | null,
): boolean {
  return service != null && missionService(mission) !== service;
}

/**
 * Which partner departments can field calls for this player right now.
 *
 * Organic Mutual Aid requests only spawn for services something can actually
 * answer — otherwise cross-service calls would pile up unanswerable (the exact
 * failure the disaster-wave adaptation was built to avoid):
 *  1. Services where the player OWNS a partner station (answerable, +25%).
 *     Only these are returned when one exists — the station the player built
 *     is the one whose calls pop up.
 *  2. Otherwise, every other service when "City Answers Mutual Aid Calls"
 *     (CPU aid) is enabled — the simulated city fields them.
 *  3. Otherwise, every other service when "Simulated Cross-Service Incidents"
 *     (v0.22.8 citySim) is enabled — the city spawns the call AND resolves it
 *     itself, so other departments' work is visible without ever piling up
 *     unanswerable.
 *  4. Otherwise nothing.
 */
export function partnerAgencyServices(
  stations: { type: string }[],
  service: 'fire' | 'police' | 'ems' | null,
  cpuAid: boolean,
  citySim = false,
): ('fire' | 'police' | 'ems')[] {
  if (!service) return [];
  const others = (['fire', 'police', 'ems'] as const).filter((s) => s !== service);
  const owned = new Set(stations.map((s) => stationServiceFor(s.type)));
  const stationPartners = others.filter((s) => owned.has(s));
  if (stationPartners.length > 0) return stationPartners;
  if (cpuAid) return others;
  if (citySim) return others;
  return [];
}

/**
 * Should the simulated city resolve this cross-service call on its own, or
 * is it (or could it be) answerable by the player?
 *
 * - CPU aid on → the city answers every cross-service call (v0.22.2 behavior).
 * - Otherwise citySim (v0.22.8) only answers calls whose department the player
 *   does NOT own a station for — a built partner station keeps its calls
 *   answerable (+25%) instead of the city stealing them.
 * - Otherwise the call stays in the player's queue.
 */
export function cityAnswersCall(
  mission: Pick<Mission, 'category'>,
  stations: { type: string }[],
  service: 'fire' | 'police' | 'ems' | null,
  cpuAid: boolean,
  citySim = false,
): boolean {
  if (!service) return false;
  if (!isPartnerAgencyCall(mission, service)) return false;
  if (cpuAid) return true;
  if (!citySim) return false;
  const svc = missionService(mission);
  return !stations.some((s) => stationServiceFor(s.type) === svc);
}

// ── Airlift adaptation (v0.22.18) ─────────────────────────────────────────
// An air-ambulance callout (Remote Rescue / Highway Trauma) is only meaningful
// when the city can actually answer it: an EMS unit to crew the scene AND the
// helipad to fly the critical transport. In a police-only city with no EMS
// units and no helipad, such a call would sit on the board unanswerable — the
// exact pile-up the disaster-wave adaptation was built to avoid. These helpers
// reschedule the call (re-roll to a road-answerable EMS template) or refuse to
// spawn it in the first place.

/** Does the player field at least one unit that can crew this department? */
export function serviceHasUnits(
  units: { type?: string | null }[],
  service: 'fire' | 'police' | 'ems',
): boolean {
  return units.some((u) => getUnitServiceType(u.type) === service);
}

/** Can an air-ambulance callout spawn meaningfully right now? */
export function emsAirliftEligible(units: { type?: string | null }[], helipad: unknown): boolean {
  return serviceHasUnits(units, 'ems') && helipad != null;
}

/**
 * Reschedule an airlift template away when the city can't run airlifts: the
 * call is re-rolled to a road-answerable EMS template (a same-difficulty-ish
 * pick from the non-airlift pool). Forced templates bypass this — chain,
 * traffic-duty, and disaster-wave calls are adapted upstream instead.
 */
export function adaptAirliftTemplate<T extends { id: string }>(
  template: T,
  pool: readonly T[],
  eligible: boolean,
): T {
  if (eligible || !AIRLIFT_TEMPLATE_IDS.has(template.id)) return template;
  const roadAnswerable = pool.filter((t) => !AIRLIFT_TEMPLATE_IDS.has(t.id));
  if (roadAnswerable.length === 0) return template;
  return roadAnswerable[Math.floor(Math.random() * roadAnswerable.length)];
}

/**
 * Should a partner call of this department spawn at all? False when it would
 * sit unanswerable: no player units for the department AND the simulated city
 * won't resolve it (CPU aid and city-sim both off).
 */
export function partnerCallAnswerable(
  service: 'fire' | 'police' | 'ems',
  units: { type?: string | null }[],
  cpuAid: boolean,
  citySim: boolean,
): boolean {
  if (serviceHasUnits(units, service)) return true;
  return cpuAid || citySim;
}
