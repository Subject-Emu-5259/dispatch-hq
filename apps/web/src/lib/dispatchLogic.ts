// ============================================
// Dispatch HQ — Dispatch Logic
// ============================================

import type { Unit, Mission, Station, GeoPoint, MissionCategory, ServiceType } from '@dispatch-hq/shared';
import { fetchDrivingRoute, getUnitServiceType } from '@/utils/routing';
import { applyTravelTech } from '@/lib/techTree';
import { generateRoadPath, haversineKm } from '@/utils/roadPathfinding';
import { AIR_SPEED_MS } from '@/lib/hospital';
import { isAirliftMission } from '@/lib/radioDialogueEngine';
import { useGameStore } from '@/stores/gameStore';
import { stationCrewEffectiveness } from '@/lib/personnel';
import { veterancyRankFor, shiftResponseMultiplier, crewConditionMultiplier, applyUnitsStaffEta } from '@/lib/unitsStaff';
import { loadSettings } from '@/utils/settings';

/**
 * Dispatch a unit to a mission: route it along real roads, put it en_route,
 * and attach it to the mission's assigned units. Shared by the dispatch UI and
 * the field-activity system (pursuit intercepts, backup requests).
 */
export async function dispatchUnitToMission(unitId: string, mission: Mission): Promise<boolean> {
  const st = useGameStore.getState();
  const unit = st.units.find((u) => u.id === unitId);
  if (!unit || !unit.position || !mission.location) return false;
  // v0.22.12 duplicate-dispatch guard: a unit may have been grabbed by another
  // call between the picker render and this dispatch (popup + board + sidebar
  // can race). Consult FRESH state — never double-assign a unit that is
  // committed to a different active mission.
  if (unitCommittedElsewhere(unit, mission.id, st.missions)) return false;
  try {
    // A fatigued crew rolls out slower — divide the ETA by crew effectiveness
    // (1.0 fresh → 0.75 exhausted), so long shifts cost response time. With
    // Shift Pressure off (v0.20.2) effectiveness is always 1.
    const eff = stationCrewEffectiveness(st.stations, unit, loadSettings().fatigueMode ?? 'full');
    // Air-ambulance response (v0.22.18): when an airlift-capable callout comes
    // in and the commander has placed a helipad, EMS units fly the WHOLE call —
    // straight-line to the scene at ~200 km/h, then the pad with the patient.
    // MapView renders these units as helicopters and the radio speaks airborne.
    const airborne = st.helipad != null && getUnitServiceType(unit.type) === 'ems' && isAirliftMission(mission);
    let waypoints: GeoPoint[];
    let etaBaseSec: number;
    let distanceKm: number;
    if (airborne) {
      const flight = generateRoadPath(unit.position, mission.location);
      waypoints = flight.waypoints;
      distanceKm = haversineKm(unit.position, mission.location);
      etaBaseSec = Math.max(8, Math.round((distanceKm * 1000) / AIR_SPEED_MS));
    } else {
      const route = await fetchDrivingRoute(unit.position, mission.location, unit.speed || 13.9);
      waypoints = route.waypoints;
      distanceKm = route.distanceKm;
      etaBaseSec = route.durationSec;
    }
    // Batch 3a: veterancy rank, shift coverage, and rested/exhausted crew
    // condition all move the ETA on top of the personnel effectiveness
    // divisor (pre-3a saves are neutral: Rookie 1.0, unscheduled 1.0, no crew 1.0).
    const homeStation = st.stations.find((s) => s.id === unit.stationId);
    const eta = applyUnitsStaffEta(applyTravelTech(etaBaseSec), {
      veterancyRank: veterancyRankFor(unit.veterancyXp),
      crewEffectiveness: eff,
      shiftMultiplier: homeStation ? shiftResponseMultiplier(homeStation, st.gameMinutes) : 1,
      crewConditionMultiplier: crewConditionMultiplier(homeStation?.employees ?? [], unit.crewIds),
    });
    st.updateUnit(unitId, {
      status: 'en_route',
      missionId: mission.id,
      eta,
      etaTotal: eta,
      destination: mission.location,
      waypoints,
      waypointIndex: 0,
      returnTimer: undefined,
      routeDistanceKm: distanceKm,
    });
    const current = useGameStore.getState().missions.find((m) => m.id === mission.id);
    const assigned = Array.from(new Set([...(current?.assignedUnits ?? []), unitId]));
    // Only promote a fresh mission to en_route. A backup unit joining a mission
    // that's already on scene or in progress must NOT regress its status.
    const status = current && (current.status === 'on_scene' || current.status === 'in_progress') ? current.status : 'en_route';
    st.updateMission(mission.id, { status, assignedUnits: assigned });
    return true;
  } catch {
    return false;
  }
}

export function getAvailableUnits(units: Unit[], service: string): Unit[] {
  return units.filter((u) => {
    if (u.status !== 'available') return false;
    switch (service) {
      case 'fire': return ['engine', 'ladder', 'rescue', 'battalion_chief'].includes(u.type);
      case 'police': return ['patrol_car', 'swat_van', 'k9_unit', 'police_suv'].includes(u.type);
      case 'ems': return ['ambulance', 'paramedic_unit', 'ems_supervisor', 'fire_ambulance'].includes(u.type);
      default: return true;
    }
  });
}

/**
 * Required services of a mission NOT covered by a candidate crew — the map
 * popup's needs-backup dimming (v0.22.17). Mirrors backupServicesFor for the
 * multi-unit quick-dispatch set: when a required department has no candidate,
 * dispatching would send a partial crew, so the popup flags it the same way a
 * patrol intercept does (dimmed + "Needs backup: …").
 */
export function missingBackupServices(
  units: Unit[],
  mission: Pick<Mission, 'category' | 'requirements'>,
): ServiceType[] {
  const covered = new Set(units.map((u) => getUnitServiceType(u.type)));
  return requiredServicesForMission(mission).filter((s) => !covered.has(s));
}

/**
 * Nearest dispatchable unit of a single service, for the patrol-intercept
 * backup pre-dispatch (v0.22.17): when a spotting unit flags a mission it can
 * only partially crew, one click sends the nearest available partner unit of
 * each missing service alongside it. Same readiness definition as
 * findNearestDispatchUnits (available/returning/patrolling, positioned, not in
 * training) so the picker and the auto-dispatch never disagree.
 */
export function findNearestBackupUnit(
  units: Unit[],
  service: ServiceType,
  mission: Pick<Mission, 'location'>,
): Unit | null {
  return units
    .filter(
      (u) =>
        getUnitServiceType(u.type) === service &&
        (u.status === 'available' || u.status === 'returning' || u.status === 'patrolling') &&
        u.position &&
        !(u.trainingEndsAt && u.trainingEndsAt > Date.now()),
    )
    .sort((a, b) => haversineKm(a.position!, mission.location) - haversineKm(b.position!, mission.location))[0] ?? null;
}

/**
 * Every service a mission can legitimately answer with — its primary service
 * plus the services behind its unit requirements. A traffic accident (police)
 * that needs a fire engine for extraction therefore answers with BOTH police
 * and fire units; a hazmat scene needing an ambulance answers with fire + EMS.
 * This is what every quick-dispatch surface filters against, so crossover
 * requirements are never hidden or silently swapped for the wrong service.
 */
export function requiredServicesForMission(mission: Pick<Mission, 'category' | 'requirements'>): ServiceType[] {
  const services = new Set<ServiceType>([serviceForCategory(mission.category)]);
  for (const r of mission.requirements) {
    const svc = getUnitServiceType(r.unitType);
    if (svc === 'police' || svc === 'fire' || svc === 'ems') services.add(svc);
  }
  return [...services];
}

/** Whether a unit type satisfies any of a mission's requirements (cross-service included). */
export function unitFulfillsRequirement(unitType: string, mission: Pick<Mission, 'requirements'>): boolean {
  // Staged batch: trooper/deputy cars are police-service patrol vehicles, so
  // they satisfy base patrol_car requirements (but NOT swat_van/k9_unit).
  // Their own dedicated templates still name them explicitly.
  return mission.requirements.some((r) =>
    r.unitType === unitType ||
    (r.unitType === 'patrol_car' && (unitType === 'trooper_car' || unitType === 'deputy_car')),
  );
}

/**
 * Assigned units that are "backup" for a mission (v0.22.18): a partner-department
 * unit auto-added by the needs-backup patrol intercept pre-dispatch, or any
 * cross-service unit answering a call that requires another department. A unit
 * counts as backup when its service is one the mission requires but is NOT the
 * primary service — the board labels these "Backup en route" instead of
 * silently mixing them into the main unit list.
 */
export function backupAssignedUnits(
  assigned: Pick<Unit, 'id' | 'type' | 'name'>[],
  mission: Pick<Mission, 'category' | 'requirements'>,
): Pick<Unit, 'id' | 'type' | 'name'>[] {
  const svc = serviceForCategory(mission.category);
  const required = new Set(requiredServicesForMission(mission));
  return assigned.filter((u) => {
    const us = getUnitServiceType(u.type);
    return us !== svc && required.has(us);
  });
}

/** 'patrol_car' → 'patrol car' (lowercase — the caller adds the service prefix) */
function humanizeUnitType(t: string): string {
  return t.replace(/_/g, ' ');
}

/** 'ems' → 'EMS', 'fire' → 'Fire' */
export function serviceDisplayName(s: ServiceType): string {
  return s === 'ems' ? 'EMS' : s.charAt(0).toUpperCase() + s.slice(1);
}

export interface DispatchPlanPart {
  label: string;
  service: ServiceType;
  /** True when this part is a cross-service requirement, not the primary department. */
  crossover: boolean;
}

/**
 * Human-readable dispatch plan for a mission — the services (and their units)
 * needed to answer it, shown BEFORE any unit is picked. The primary service
 * comes first, named by its unit type when the call needs a specific rig
 * ("Fire engine"), then each cross-service requirement by name ("EMS") — so a
 * traffic accident that needs a fire engine reads "Police + Fire" and a fire
 * scene needing an ambulance reads "Fire engine + EMS". The crossover flag
 * lets the UI tint requirement services differently from the department's own.
 */
export function dispatchPlanParts(mission: Pick<Mission, 'category' | 'requirements'>): DispatchPlanPart[] {
  const primary = serviceForCategory(mission.category);
  const reqServices = new Set<ServiceType>();
  const primaryTypes = new Set<string>();
  for (const r of mission.requirements) {
    const svc = getUnitServiceType(r.unitType);
    if (svc === 'fire' || svc === 'police' || svc === 'ems') {
      reqServices.add(svc);
      if (svc === primary) primaryTypes.add(r.unitType);
    }
  }
  const parts: DispatchPlanPart[] = [];
  // Primary part: name the specific rig when the call needs exactly one
  // ("Fire engine", "Patrol car"), else the department name. The service
  // prefix keeps a lone "engine" from reading like a machine part.
  parts.push({
    label: primaryTypes.size === 1
      ? `${serviceDisplayName(primary)} ${humanizeUnitType([...primaryTypes][0])}`
      : serviceDisplayName(primary),
    service: primary,
    crossover: false,
  });
  for (const svc of reqServices) {
    if (svc !== primary) parts.push({ label: serviceDisplayName(svc), service: svc, crossover: true });
  }
  return parts;
}

/** "Fire engine + EMS" — one-line join of {@link dispatchPlanParts}. */
export function dispatchPlanLabel(mission: Pick<Mission, 'category' | 'requirements'>): string {
  return dispatchPlanParts(mission)
    .map((p) => p.label)
    .join(' + ');
}

/**
 * Whether a service can legitimately answer a mission — the same rule every
 * quick-dispatch surface filters against. Patrol intercept suggestions use it
 * too (v0.22.12): a patrolling unit only "spots" incidents its own service can
 * actually answer (primary service or a unit requirement), never a
 * weather-flavored assist suggestion its crews can't fulfill.
 */
export function serviceCanAnswerMission(
  service: ServiceType,
  mission: Pick<Mission, 'category' | 'requirements'>,
): boolean {
  return requiredServicesForMission(mission).includes(service);
}

/**
 * Can a unit of this type roam on patrol at all? Police always run beats;
 * EMS units only patrol once the air-ambulance helipad exists — a roving
 * medic makes sense when there's a pad to fly criticals to, and it lets
 * patrolling medics spot airlift callouts and intercept them as helicopters
 * (v0.22.18, matching the fly-the-call dispatch flow). Fire rigs stay posted
 * at their stations and answer from there.
 */
export function unitCanPatrol(type: string | null | undefined, helipad: unknown): boolean {
  const svc = getUnitServiceType(type);
  if (svc === 'police') return true;
  if (svc === 'ems') return helipad != null;
  return false;
}

/**
 * The services a unit's OWN service does NOT cover on a mission it can crew.
 * A patrol unit only spots incidents it can answer (v0.22.12), but when the
 * dispatch plan ALSO needs another department, its intercept is a partial
 * response — returns those extra services so the UI can dim the suggestion and
 * hint "needs backup". Empty when the unit fully covers the plan, or when its
 * service can't answer the mission at all (that case never produces an
 * intercept suggestion in the first place).
 */
export function backupServicesFor(
  service: ServiceType,
  mission: Pick<Mission, 'category' | 'requirements'>,
): ServiceType[] {
  if (!serviceCanAnswerMission(service, mission)) return [];
  return requiredServicesForMission(mission).filter((s) => s !== service);
}

/**
 * Fresh-state duplicate-dispatch guard (v0.22.12): is this unit already
 * committed to a DIFFERENT active mission? missionId is cleared when units are
 * released, so an attached id means an assignment — but a stale id pointing at
 * a removed/completed mission must NOT count as committed (expired calls can
 * leave one behind), so the target mission is looked up in the live list.
 * Every dispatch commit point consults this right before assigning, so a unit
 * grabbed by another call during the routing gap can never be double-assigned.
 */
export function unitCommittedElsewhere(
  unit: Unit | null | undefined,
  missionId: string,
  missions: Pick<Mission, 'id' | 'status'>[],
): boolean {
  if (!unit || !unit.missionId || unit.missionId === missionId) return false;
  return missions.some(
    (mm) => mm.id === unit.missionId && mm.status !== 'completed' && mm.status !== 'failed',
  );
}

/**
 * Why a mission's unit requirements aren't fully covered by the quick-dispatch
 * candidates — used by the map popup's requirement hint so players know WHEN a
 * required unit is busy on another call instead of the misleading "none
 * available". Returns the first unmet requirement's reason, or null.
 */
export function requirementGapReason(
  units: Unit[],
  mission: Pick<Mission, 'requirements'>,
  candidates: Unit[],
): string | null {
  if (!mission.requirements?.length) return null;
  const covered = new Map<string, number>();
  for (const c of candidates) covered.set(c.type, (covered.get(c.type) ?? 0) + 1);
  for (const r of mission.requirements) {
    const have = covered.get(r.unitType) ?? 0;
    if (have >= r.count) continue;
    const missing = r.count - have;
    const label = r.unitType.replace(/_/g, ' ');
    // A matching unit exists but is committed to another call → say WHICH one.
    const busy = units.find(
      (u) => u.type === r.unitType &&
        (u.status === 'en_route' || u.status === 'on_scene'),
    );
    if (busy) {
      return `Requires ${missing}× ${label} — ${busy.name} is already on another call`;
    }
    return `Requires ${missing}× ${label} — no ${label} available`;
  }
  return null;
}

export function getStationForMission(mission: Mission, stations: Station[]): Station | null {
  if (stations.length === 0) return null;

  let closest: Station | null = null;
  let minDist = Infinity;

  for (const station of stations) {
    const dist = haversineDistance(station.position, mission.location);
    if (dist < minDist) {
      minDist = dist;
      closest = station;
    }
  }

  return closest;
}

/**
 * Select the nearest dispatchable units for a one-tap dispatch — filling the
 * mission's requirements first (nearest per required type, in requirement
 * order), capped by the dispatch-limit tech, then topping up with the nearest
 * service-appropriate units, then any remaining dispatchable unit. Returns the
 * candidates sorted nearest-first. Powers the map's quick-dispatch popup.
 *
 * Dispatchable uses the SAME readiness definition as the Dispatch Board picker
 * (v0.22.6 fix): available, returning, or patrolling units can be re-routed —
 * but a unit still in training never can. The popup previously demanded strict
 * 'available', so a Board that showed "ready" units could silently disagree
 * with the popup's "No available units — build or recall a unit first".
 */
export function findNearestDispatchUnits(units: Unit[], mission: Mission, maxUnits: number): Unit[] {
  const available = units.filter(
    (u) =>
      (u.status === 'available' || u.status === 'returning' || u.status === 'patrolling') &&
      u.position &&
      !(u.trainingEndsAt && u.trainingEndsAt > Date.now()),
  );
  if (available.length === 0 || maxUnits <= 0) return [];

  const byDist = (a: Unit, b: Unit) =>
    haversineKm(a.position!, mission.location) - haversineKm(b.position!, mission.location);

  // Every service this call can answer with (primary + requirement services),
  // so crossover needs are never filled with the wrong department.
  const answerServices = new Set(requiredServicesForMission(mission));

  const picked: Unit[] = [];
  const used = new Set<string>();

  // 1) Requirements first: for each required unit type, take the needed count
  //    of its nearest available units, honoring the dispatch limit. This is
  //    what surfaces cross-service units (a fire engine on a traffic accident,
  //    an ambulance on a hazmat scene).
  const reqByType = new Map<string, number>();
  for (const r of mission.requirements) {
    reqByType.set(r.unitType, (reqByType.get(r.unitType) ?? 0) + r.count);
  }
  for (const [reqType, need] of reqByType) {
    if (picked.length >= maxUnits) break;
    const matches = available.filter((u) => u.type === reqType && !used.has(u.id)).sort(byDist);
    for (const u of matches.slice(0, Math.min(need, maxUnits - picked.length))) {
      picked.push(u);
      used.add(u.id);
    }
  }

  // 2) Top-up: fill the remaining budget with the nearest units from ANY of
  //    the call's answer services (primary + requirement services).
  if (picked.length < maxUnits) {
    const topup = available
      .filter((u) => !used.has(u.id) && answerServices.has(getUnitServiceType(u.type)))
      .sort(byDist);
    for (const u of topup) {
      if (picked.length >= maxUnits) break;
      picked.push(u);
      used.add(u.id);
    }
  }

  // No arbitrary last resort: a unit of the wrong department is never offered
  // as if it could answer the call. If nothing matches, the surface shows the
  // truthful "no available units" state (v0.22.10 fix).
  // Final order: requirement-matching units first (what the call needs), then
  // by distance — so a crossover engine leads the list even when a nearer
  // own-service unit exists.
  const reqTypes = new Set(mission.requirements.map((r) => r.unitType));
  return picked.sort((a, b) => {
    const aReq = reqTypes.has(a.type) ? 0 : 1;
    const bReq = reqTypes.has(b.type) ? 0 : 1;
    if (aReq !== bReq) return aReq - bReq;
    return byDist(a, b);
  });
}

/**
 * Pick the single nearest available unit that can answer a mission — preferring
 * units that match its requirements exactly (any required type), then units
 * from the mission's service, then any available unit.
 */
export function findNearestDispatchUnit(units: Unit[], mission: Mission): Unit | null {
  const available = units.filter(
    (u) => u.status === 'available' && u.position && !(u.trainingEndsAt && u.trainingEndsAt > Date.now()),
  );
  if (available.length === 0) return null;

  const reqTypes = new Set(mission.requirements.map((r) => r.unitType));
  const matchesReq = available.filter((u) => reqTypes.has(u.type));
  const service = serviceForCategory(mission.category);
  const matchesService = available.filter((u) => getUnitServiceType(u.type) === service);
  const pool = matchesReq.length > 0 ? matchesReq : matchesService;
  const candidates = pool.length > 0 ? pool : available;

  return [...candidates].sort(
    (a, b) => haversineKm(a.position!, mission.location) - haversineKm(b.position!, mission.location),
  )[0];
}

function serviceForCategory(category: MissionCategory): 'fire' | 'police' | 'ems' {
  switch (category) {
    case 'fire':
    case 'hazmat':
    case 'rescue':
      return 'fire';
    case 'traffic':
    case 'police':
      return 'police';
    case 'ems':
      return 'ems';
  }
}

function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const aa = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}